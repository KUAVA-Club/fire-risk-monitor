import { state, update } from './state.js';
import { fetchFireData } from './api.js';
import { styleFromBackend } from './risk.js';
import { toast } from './toast.js';

const h3 = window.h3;

export const map = L.map('map', {
  preferCanvas: true,
  minZoom: 2,
  maxZoom: 14,
  zoomControl: false,
  worldCopyJump: false,
}).setView([state.lat, state.lon], state.zoom);

L.control.zoom({ position: 'topright' }).addTo(map);

const BASEMAPS = {
  dark: () => [
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }),
  ],
  light: () => [
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }),
  ],
  satellite: () => [
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      attribution: '',
      maxZoom: 19,
      opacity: 0.9,
    }),
  ],
};

let activeBasemapLayers = [];
export function setBasemap(name) {
  activeBasemapLayers.forEach(l => map.removeLayer(l));
  const factory = BASEMAPS[name] || BASEMAPS.dark;
  activeBasemapLayers = factory();
  activeBasemapLayers.forEach(l => l.addTo(map));
  activeBasemapLayers.forEach(l => l.bringToBack && l.bringToBack());
  document.body.dataset.basemap = name;
  if (typeof drawHexGrid === 'function') drawHexGrid();
}

export const riskLayer      = L.layerGroup().addTo(map);
export const landcoverLayer = L.layerGroup();
export const alertsLayer    = L.layerGroup().addTo(map);

const hexCells = new Map();
const clickedCells = new Map();

const cellListeners = new Set();
export function onCellSelected(fn) { cellListeners.add(fn); }
function emitSelected(payload) { cellListeners.forEach(fn => fn(payload)); }

// Backend grid cell is 0.05° ≈ 5.5km × 5.5km (≈ 30 km²) at the equator.
// H3 res 6 ≈ 3.2km edge / 36 km² area — the closest match without
// going so small that multiple hexes collapse onto one backend cell.
export function resolutionForZoom(zoom) {
  if (zoom <= 2)  return 1;
  if (zoom <= 4)  return 2;
  if (zoom <= 6)  return 3;
  if (zoom <= 8)  return 4;
  if (zoom <= 10) return 5;
  return 6;
}

const MAX_CELLS_RENDERED = 2000;

function baseHexStyle() {
  if (state.basemap === 'satellite') {
    return { color: '#ffffff', weight: 1, fillColor: '#ffffff', fillOpacity: 0.05 };
  }
  if (state.basemap === 'light') {
    return { color: '#a0a0a0', weight: 1, fillColor: '#000000', fillOpacity: 0.04 };
  }
  return { color: '#3a3f55', weight: 1, fillColor: '#1f2333', fillOpacity: 0.08 };
}

function hoverHexOpacity() {
  if (state.basemap === 'satellite') return 0.15;
  if (state.basemap === 'light') return 0.12; 
  return 0.18;
}

function viewportPolygon() {
  const b = map.getBounds();
  const n = b.getNorth(), s = b.getSouth();
  const w = Math.max(b.getWest(), -179.9);
  const e = Math.min(b.getEast(),  179.9);
  return [[
    [n, w], [n, e], [s, e], [s, w], [n, w],
  ]];
}

export function drawHexGrid() {
  if (!state.layers.includes('risk') && !state.layers.includes('landcover')) {
    riskLayer.clearLayers();
    hexCells.clear();
    return;
  }
  const res = resolutionForZoom(map.getZoom());
  let cells;
  try {
    cells = h3.polygonToCells(viewportPolygon(), res);
  } catch (e) {
    console.warn('H3 polygonToCells failed', e);
    return;
  }
  if (cells.length > MAX_CELLS_RENDERED) {
    cells = cells.slice(0, MAX_CELLS_RENDERED);
  }

  riskLayer.clearLayers();
  hexCells.clear();

  const baseStyle = baseHexStyle();
  cells.forEach(idx => {
    const boundary = h3.cellToBoundary(idx);
    const saved = clickedCells.get(idx);
    const poly = L.polygon(boundary, {
      color:       saved ? saved.style.color : baseStyle.color,
      weight:      1,
      fillColor:   saved ? saved.style.color : baseStyle.fillColor,
      fillOpacity: saved ? 0.5 : baseStyle.fillOpacity,
      className: 'hex-cell',
      smoothFactor: 1.5,
    });
    poly.h3index = idx;
    poly.on('click', onHexClick);
    poly.on('mouseover', () => {
      if (!clickedCells.has(idx)) poly.setStyle({ fillOpacity: hoverHexOpacity() });
    });
    poly.on('mouseout', () => {
      if (!clickedCells.has(idx)) poly.setStyle({ fillOpacity: baseHexStyle().fillOpacity });
    });
    poly.addTo(riskLayer);
    hexCells.set(idx, poly);
  });
}

async function onHexClick(e) {
  L.DomEvent.stopPropagation(e);
  const poly = e.target;
  const idx = poly.h3index;
  const [lat, lon] = h3.cellToLatLng(idx);

  if (clickedCells.has(idx)) {
    clickedCells.delete(idx);
    poly.setStyle(baseHexStyle());
    emitSelected({ cleared: true, key: idx });
    return;
  }

  poly.setStyle({ color: '#ffb347', fillColor: '#ffb347', fillOpacity: 0.4 });

  try {
    const data = await fetchFireData(lat, lon);
    if (data.is_relevant === false) {
      const style = { color: '#6c757d', label: 'NOT APPLICABLE', action: 'Fire monitoring disabled for this terrain.' };
      clickedCells.set(idx, { style, data });
      poly.setStyle({ color: style.color, fillColor: style.color, fillOpacity: 0.4 });
      emitSelected({ lat, lon, data, style, key: idx, isHex: true });
      return;
    }
    const fri = data.risk_index;
    const style = styleFromBackend(data, fri);
    clickedCells.set(idx, { style, data, fri });
    poly.setStyle({ color: style.color, fillColor: style.color, fillOpacity: 0.45 });
    emitSelected({ lat, lon, data, fri, style, key: idx, isHex: true });
  } catch (err) {
    console.error(err);
    poly.setStyle({ color: '#ff4d4f', fillOpacity: 0.3 });
    toast('Backend unreachable — try again', 'error');
    emitSelected({ error: 'Backend unreachable' });
  }
}

export function flyTo(lat, lon, zoom = 12) {
  map.flyTo([lat, lon], zoom, { animate: true, duration: 1.2 });
}

export function center() {
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng };
}

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}


export function highlightHexAt(lat, lon) {
  const res = resolutionForZoom(map.getZoom());
  const idx = h3.latLngToCell(lat, lon, res);
  const poly = hexCells.get(idx);
  if (poly) poly.fire('click');
}

map.on('moveend zoomend', () => {
  const c = map.getCenter();
  update({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
  drawHexGrid();
});

export function clearSelections() {
  clickedCells.forEach((_, idx) => {
    const poly = hexCells.get(idx);
    if (poly) poly.setStyle(baseHexStyle());
  });
  clickedCells.clear();
}

setBasemap(state.basemap);

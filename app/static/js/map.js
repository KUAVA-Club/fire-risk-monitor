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

// Terrain classification: two parallel checks decide whether a point
// is fire-relevant.
//
//   - Open-Meteo elevation: returns exactly 0 over ocean / sea (their
//     DEM has no data there). Reliable water detector.
//   - Overpass `around:150` building count + landuse polygons:
//     reliable urban detector. Empty forest / wilderness returns 0.
//
// Both are cached aggressively. The backend's MODIS land-cover API
// times out for nearly every request so the frontend has to be the
// authoritative source for "is this point fire-relevant?".
const terrainCache = new Map();

async function fetchElevation(lat, lon) {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j.elevation) ? j.elevation[0] : null;
  } catch (e) { return null; }
}

async function fetchUrbanScore(lat, lon) {
  const query = `[out:json][timeout:6];(`
    + `way["building"](around:150,${lat},${lon});`
    + `way["landuse"~"^(residential|commercial|industrial|retail)$"](around:300,${lat},${lon});`
    + `);out tags;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
    });
    if (!r.ok) return { buildings: 0, urbanLanduse: 0 };
    const j = await r.json();
    let buildings = 0, urbanLanduse = 0;
    for (const el of j.elements || []) {
      const t = el.tags || {};
      if (t.building) buildings++;
      if (['residential','commercial','industrial','retail'].includes(t.landuse)) urbanLanduse++;
    }
    return { buildings, urbanLanduse };
  } catch (e) {
    return { buildings: 0, urbanLanduse: 0 };
  }
}

async function classifyTerrain(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (terrainCache.has(key)) return terrainCache.get(key);

  const [elev, urban] = await Promise.all([
    fetchElevation(lat, lon),
    fetchUrbanScore(lat, lon),
  ]);

  let result;
  if (elev === 0) {
    result = { relevant: false, reason: 'Water body — not fire-relevant' };
  } else if (urban.buildings >= 5 || urban.urbanLanduse >= 1) {
    result = { relevant: false, reason: 'Urban / built-up area — not fire-relevant' };
  } else {
    result = { relevant: true };
  }
  terrainCache.set(key, result);
  return result;
}

// Shared cache so a zone scan's results can be reused when the user
// clicks a nearby hex. Without this, scan and click hit different
// lat/lon → backend returns different FRI → different color.
const fireDataCache = new Map();

export function cacheFireData(lat, lon, payload) {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
  fireDataCache.set(key, { lat, lon, ...payload, ts: Date.now() });
}

function findCachedFireData(lat, lon, withinKm = 12) {
  let best = null, bestDist = withinKm;
  const now = Date.now();
  for (const v of fireDataCache.values()) {
    if (now - v.ts > 60 * 60 * 1000) continue;
    const d = haversineKm({ lat: v.lat, lon: v.lon }, { lat, lon });
    if (d < bestDist) { best = v; bestDist = d; }
  }
  return best;
}

// Hex sizing matches Open-Meteo's weather grid (~9–25 km), which is
// the coarsest input to FRI. Sampling smaller than ~9 km re-queries
// the same underlying weather cell, so H3 res 6 (~9 km diameter) is
// the right size everywhere.
export const MIN_ZOOM_FOR_GRID = 7;

export function resolutionForZoom(zoom) {
  if (zoom < MIN_ZOOM_FOR_GRID) return null;
  if (zoom <= 11) return 6;   // ~9 km diameter — matches data resolution
  return 7;                    // close-up: ~3 km
}

const MAX_CELLS_RENDERED = 5000;

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
  const n = Math.min(b.getNorth(),  75);
  const s = Math.max(b.getSouth(), -65);
  const w = Math.max(b.getWest(),  -179.9);
  const e = Math.min(b.getEast(),   179.9);
  return [[
    [n, w], [n, e], [s, e], [s, w], [n, w],
  ]];
}

function boundaryWrapsAntimeridian(boundary) {
  for (let i = 1; i < boundary.length; i++) {
    if (Math.abs(boundary[i][1] - boundary[i - 1][1]) > 180) return true;
  }
  return false;
}

function setGridHint(visible) {
  const el = document.getElementById('grid-hint');
  if (!el) return;
  el.hidden = !visible;
}

export function drawHexGrid() {
  const riskOn = state.layers.includes('risk');
  if (!riskOn && !state.layers.includes('landcover')) {
    riskLayer.clearLayers();
    hexCells.clear();
    setGridHint(false);
    return;
  }
  const res = resolutionForZoom(map.getZoom());
  if (res == null) {
    riskLayer.clearLayers();
    hexCells.clear();
    setGridHint(riskOn);
    return;
  }
  setGridHint(false);
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
    if (boundaryWrapsAntimeridian(boundary)) return;
    const saved = clickedCells.get(idx);
    const poly = L.polygon(boundary, {
      color:       saved ? saved.style.color : baseStyle.color,
      weight:      saved ? 1.5 : 1,
      fillColor:   saved ? saved.style.color : baseStyle.fillColor,
      fillOpacity: saved ? 0.65 : baseStyle.fillOpacity,
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

const NOT_APPLICABLE_STYLE = {
  color: '#6c757d',
  label: 'NOT APPLICABLE',
  action: 'Fire monitoring disabled for this terrain.',
};

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

  // Re-use a nearby cached scan/click result if we have one — this is
  // what makes a hex labelled MODERATE in the zone list still look
  // MODERATE when clicked on the map. Without it the click hits the
  // backend at a slightly different lat/lon → different FRI → drift.
  const cached = findCachedFireData(lat, lon);
  if (cached) {
    const fri = cached.fri;
    const style = styleFromBackend(cached.data, fri);
    clickedCells.set(idx, { style, data: cached.data, fri });
    poly.setStyle({ color: style.color, fillColor: style.color, fillOpacity: 0.65, weight: 1.5 });
    emitSelected({ lat, lon, data: cached.data, fri, style, key: idx, isHex: true });
    return;
  }

  const terrain = await classifyTerrain(lat, lon);
  if (!terrain.relevant) {
    const data = {
      is_relevant: false,
      land_cover: terrain.reason.split(' — ')[0],
      temp: null,
      wind_speed: null,
    };
    clickedCells.set(idx, { style: NOT_APPLICABLE_STYLE, data });
    poly.setStyle(baseHexStyle());
    toast(terrain.reason, 'info', 1800);
    emitSelected({ lat, lon, data, style: NOT_APPLICABLE_STYLE, key: idx, isHex: true });
    return;
  }

  try {
    const data = await fetchFireData(lat, lon);
    if (data.is_relevant === false) {
      clickedCells.set(idx, { style: NOT_APPLICABLE_STYLE, data });
      poly.setStyle(baseHexStyle());
      emitSelected({ lat, lon, data, style: NOT_APPLICABLE_STYLE, key: idx, isHex: true });
      return;
    }
    const fri = data.risk_index;
    const style = styleFromBackend(data, fri);
    clickedCells.set(idx, { style, data, fri });
    cacheFireData(lat, lon, { data, fri });
    poly.setStyle({
      color: style.color,
      fillColor: style.color,
      fillOpacity: 0.65,
      weight: 1.5,
    });
    emitSelected({ lat, lon, data, fri, style, key: idx, isHex: true });
  } catch (err) {
    console.error(err);
    poly.setStyle(baseHexStyle());
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

// Wipe hexes the instant we drop below the visibility threshold, so
// Leaflet's zoom animation never has stale polygons to stretch into
// parallel lines across the world.
function maybeClearForLowZoom() {
  if (map.getZoom() < MIN_ZOOM_FOR_GRID && riskLayer.getLayers().length > 0) {
    riskLayer.clearLayers();
    hexCells.clear();
  }
}
map.on('zoomstart', maybeClearForLowZoom);
map.on('zoom',      maybeClearForLowZoom);
map.on('zoomend',   maybeClearForLowZoom);

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

import { state, update, toggleLayer } from './state.js';
import { RISK_LEVELS, styleFromBackend, levelRank } from './risk.js';

function sortGridsBySeverity(grids) {
  grids.sort((a, b) => {
    const r = levelRank(b.data?.alert_level ?? b.style?.label) - levelRank(a.data?.alert_level ?? a.style?.label);
    if (r !== 0) return r;
    return (b.fri ?? -Infinity) - (a.fri ?? -Infinity);
  });
}
import { map, flyTo, onCellSelected, clearSelections, haversineKm, setBasemap } from './map.js';
import { refreshAlerts } from './layers.js';
import { fetchFireData } from './api.js';
import { toast } from './toast.js';

export const ZONE_RADIUS_KM = 50;
const ZONE_STORAGE_KEY = 'frm.zones.v1';

const $ = (id) => document.getElementById(id);

export function buildLegend() {
  const el = $('legend-rows');
  el.innerHTML = '';
  [...RISK_LEVELS].reverse().forEach(lvl => {
    el.insertAdjacentHTML('beforeend', `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${lvl.color}"></span>
        <span>${lvl.label}</span>
      </div>
    `);
  });
}

export function wireLayerToggles() {
  document.querySelectorAll('[data-layer]').forEach(cb => {
    cb.checked = state.layers.includes(cb.dataset.layer);
    cb.addEventListener('change', () => {
      toggleLayer(cb.dataset.layer, cb.checked);
    });
  });
}

export function wireTimeRange() {
  const wrap = $('time-range');
  wrap.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.since === state.since);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      update({ since: b.dataset.since });
    });
  });
}

export function wireBasemap() {
  const wrap = $('basemap-toggle');
  wrap.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.basemap === state.basemap);
    b.addEventListener('click', () => {
      wrap.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      update({ basemap: b.dataset.basemap });
      setBasemap(b.dataset.basemap);
    });
  });
}

async function geocodePlace(query) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('geocode failed');
  const results = await r.json();
  if (!results.length) return null;
  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    name: results[0].display_name,
  };
}

export function wireSearch() {
  const input = $('place-input');

  async function doSearch() {
    const q = input.value.trim();
    if (!q) return;
    const m = q.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lon = parseFloat(m[2]);
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        toast('Invalid latitude / longitude', 'error');
        return;
      }
      flyTo(lat, lon, 12);
      return;
    }
    try {
      const r = await geocodePlace(q);
      if (!r) { toast(`No results for "${q}"`, 'info'); return; }
      flyTo(r.lat, r.lon, 11);
      toast(`Flew to ${r.name.split(',')[0]}`, 'success');
    } catch (e) {
      toast('Geocoding failed — try again', 'error');
    }
  }

  $('place-btn').addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  $('geo-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Geolocation not supported', 'error'); return; }
    toast('Locating…', 'info', 2000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        flyTo(pos.coords.latitude, pos.coords.longitude, 12);
        toast('Centered on your location', 'success');
      },
      (err) => {
        toast(err.code === 1 ? 'Location permission denied' : 'Location unavailable', 'error');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );
  });

  $('reset-btn').addEventListener('click', (e) => {
    e.preventDefault();
    input.value = '';
    clearSelections();
    clearAllZones();
    closeDetail();
    map.flyTo([20, 0], 2, { animate: true, duration: 1 });
  });
}

let zones = [];
let zoneSeq = 0;

function saveZones() {
  try {
    const data = {
      seq: zoneSeq,
      zones: zones.map(z => ({
        id: z.id,
        center: z.center,
        grids: z.grids.map(g => ({ key: g.key, lat: g.lat, lon: g.lon, fri: g.fri, data: g.data, style: g.style })),
      })),
    };
    localStorage.setItem(ZONE_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('zone save failed', e);
  }
}

export function loadPersistedZones() {
  try {
    const raw = localStorage.getItem(ZONE_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    zoneSeq = data.seq ?? 0;
    zones = (data.zones ?? []).map(z => ({
      id: z.id,
      center: z.center,
      grids: z.grids ?? [],
      circle: createZoneCircle(z.center.lat, z.center.lon),
    }));
    renderZones();
  } catch (e) {
    console.warn('zone load failed', e);
  }
}

function findZoneAt(lat, lon) {
  for (const z of zones) {
    if (haversineKm(z.center, { lat, lon }) <= ZONE_RADIUS_KM) return z;
  }
  return null;
}

function createZoneCircle(lat, lon) {
  return L.circle([lat, lon], {
    radius: ZONE_RADIUS_KM * 1000,
    color: '#ff6b35',
    weight: 1.5,
    fillColor: '#ff6b35',
    fillOpacity: 0.05,
    dashArray: '4 6',
    interactive: false,
  }).addTo(map);
}

function createZone(lat, lon) {
  zoneSeq += 1;
  const z = {
    id: zoneSeq,
    center: { lat, lon },
    grids: [],
    circle: createZoneCircle(lat, lon),
  };
  zones.push(z);
  return z;
}

function removeZone(id) {
  const z = zones.find(x => x.id === id);
  if (!z) return;
  z.scanning = false;
  if (z.circle) map.removeLayer(z.circle);
  zones = zones.filter(x => x.id !== id);
  renderZones();
  saveZones();
}

function addGridToZone({ lat, lon, fri, data, style, key }) {
  let z = findZoneAt(lat, lon);
  if (!z) z = createZone(lat, lon);

  const existing = z.grids.find(g => g.key === key);
  if (existing) {
    Object.assign(existing, { lat, lon, fri, data, style });
  } else {
    z.grids.push({ key, lat, lon, fri, data, style });
  }
  sortGridsBySeverity(z.grids);
  renderZones();
  saveZones();
}

function removeGridFromZones(key) {
  zones.forEach(z => {
    z.grids = z.grids.filter(g => g.key !== key);
  });
  zones = zones.filter(z => z.grids.length > 0 || z._pinned);
  zones.filter(z => z.grids.length === 0 && z.circle).forEach(z => {
    map.removeLayer(z.circle);
    z.circle = null;
  });
  renderZones();
  saveZones();
}

const SCAN_RESOLUTION = 5;     // H3 res 5 ~ 8.5km edge, ~252 km² area
const SCAN_DISK_RINGS = 6;     // rings out from center cell — covers ~51km
const SCAN_CONCURRENCY = 5;

async function scanZone(zone) {
  if (zone.scanning) return;
  const h3 = window.h3;
  if (!h3) { toast('H3 library not loaded', 'error'); return; }

  const centerIdx = h3.latLngToCell(zone.center.lat, zone.center.lon, SCAN_RESOLUTION);
  let disk;
  try { disk = h3.gridDisk(centerIdx, SCAN_DISK_RINGS); }
  catch (e) { toast('Failed to compute scan area', 'error'); return; }

  const existingKeys = new Set(zone.grids.map(g => g.key));
  const toScan = disk
    .map(idx => {
      const [lat, lon] = h3.cellToLatLng(idx);
      return { idx, lat, lon };
    })
    .filter(c => haversineKm(zone.center, { lat: c.lat, lon: c.lon }) <= ZONE_RADIUS_KM)
    .filter(c => !existingKeys.has(c.idx));

  if (toScan.length === 0) {
    toast(`Zone ${zone.id} already fully scanned`, 'info');
    return;
  }

  zone.scanning = true;
  zone.scanTotal = toScan.length;
  zone.scanDone = 0;
  renderZones();
  toast(`Scanning ${toScan.length} cells in Zone ${zone.id}…`, 'info', 2500);

  let i = 0;
  const worker = async () => {
    while (i < toScan.length && zone.scanning) {
      const c = toScan[i++];
      try {
        const data = await fetchFireData(c.lat, c.lon);
        if (data.is_relevant !== false) {
          const fri = data.risk_index;
          const style = styleFromBackend(data, fri);
          zone.grids.push({ key: c.idx, lat: c.lat, lon: c.lon, fri, data, style });
          sortGridsBySeverity(zone.grids);
        }
      } catch (e) {
        console.error('scan fetch failed', e);
      } finally {
        zone.scanDone += 1;
        renderZones();
      }
    }
  };
  await Promise.all(Array.from({ length: SCAN_CONCURRENCY }, worker));

  zone.scanning = false;
  renderZones();
  saveZones();
  toast(`Zone ${zone.id} scan complete · ${zone.grids.length} grids`, 'success');
}

function renderZones() {
  const container = $('zones-list');
  const empty = $('zones-empty');
  const count = $('zone-count');
  container.innerHTML = '';
  count.textContent = zones.length;

  if (zones.length === 0) {
    empty.style.display = 'block';
    empty.textContent = 'Click a hex on the map to start Zone 1.';
    return;
  }
  empty.style.display = 'none';

  zones.forEach(z => {
    const section = document.createElement('div');
    section.className = 'zone-section';

    const head = document.createElement('div');
    head.className = 'zone-section-head';
    const progress = z.scanning
      ? `<span class="scan-progress">${z.scanDone}/${z.scanTotal}</span>`
      : '';
    const scanBtn = z.scanning
      ? `<button class="btn-icon" data-act="scan" disabled title="Scanning"><span class="spinner"></span></button>`
      : `<button class="btn-icon" data-act="scan" title="Auto-scan this zone">↻</button>`;
    head.innerHTML = `
      <div class="zone-section-title">Zone ${z.id}${progress}</div>
      <div class="zone-section-actions">
        ${scanBtn}
        <button class="btn-icon zone-section-remove" data-act="remove" title="Remove zone">×</button>
      </div>
    `;
    head.querySelector('[data-act="scan"]').addEventListener('click', (e) => {
      e.stopPropagation();
      scanZone(z);
    });
    head.querySelector('[data-act="remove"]').addEventListener('click', (e) => {
      e.stopPropagation();
      removeZone(z.id);
    });
    head.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      flyTo(z.center.lat, z.center.lon, 10);
    });
    section.appendChild(head);

    const meta = document.createElement('div');
    meta.className = 'zone-section-meta';
    meta.textContent = `${z.center.lat.toFixed(4)}, ${z.center.lon.toFixed(4)} · ${z.grids.length} grid${z.grids.length === 1 ? '' : 's'}`;
    section.appendChild(meta);

    const grids = document.createElement('div');
    grids.className = 'zone-section-grids';
    z.grids.forEach(g => {
      const card = document.createElement('div');
      card.className = 'zone-card';
      card.style.setProperty('--c', g.style.color);
      const labelKey = (g.style.label || '').toUpperCase().replace(/\s+/g, '_');
      card.dataset.level = labelKey;
      card.innerHTML = `
        <div class="zc-head">
          <span class="zc-label">${g.style.label}</span>
          <span class="zc-fri">${g.fri != null ? g.fri.toFixed(1) : '—'}</span>
        </div>
        <div class="zc-coord">${g.lat.toFixed(5)}, ${g.lon.toFixed(5)}</div>
      `;
      card.addEventListener('click', () => {
        flyTo(g.lat, g.lon, 13);
        openDetail({ lat: g.lat, lon: g.lon, data: g.data, fri: g.fri, style: g.style });
      });
      grids.appendChild(card);
    });
    section.appendChild(grids);

    container.appendChild(section);
  });
}

export function clearAllZones() {
  zones.forEach(z => {
    z.scanning = false;
    if (z.circle) map.removeLayer(z.circle);
  });
  zones = [];
  zoneSeq = 0;
  renderZones();
  saveZones();
}

export function openDetail({ lat, lon, data, fri, style }) {
  const resolved = styleFromBackend(data, fri) || style;
  const color = resolved?.color ?? '';
  const label = resolved?.label ?? '—';

  document.body.classList.add('detail-open');

  const rail = document.getElementById('rail-right');
  rail.style.setProperty('--level-color', color || 'var(--accent)');

  const title = $('detail-title');
  title.textContent = label;
  title.style.color = color;

  $('detail-coords').textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;

  const friEl = $('m-fri');
  friEl.textContent = fri != null ? fri.toFixed(1) : '—';
  friEl.style.color = color;

  const alertEl = $('m-alert');
  alertEl.textContent = label;
  alertEl.style.color = color;

  $('m-temp').textContent      = data?.temp != null ? `${data.temp}°C` : '—';
  $('m-wind').textContent      = data?.wind_speed != null ? `${data.wind_speed} km/h` : '—';
  $('m-landcover').textContent = data?.land_cover ?? '—';
  $('m-relevant').textContent  = data?.is_relevant === false ? 'No' : 'Yes';
  $('m-action').textContent    = resolved?.action ?? '—';
}

export function closeDetail() {
  document.body.classList.remove('detail-open');
}

export function wireDetail() {
  $('detail-close').addEventListener('click', closeDetail);
  onCellSelected((payload) => {
    if (payload?.error) { closeDetail(); return; }
    if (payload?.cleared) {
      if (payload.key != null) removeGridFromZones(payload.key);
      closeDetail();
      return;
    }
    if (payload?.fri != null) {
      addGridToZone(payload);
    }
    openDetail(payload);
  });
}

export function setLastUpdated() {
  const t = new Date();
  $('last-updated').textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

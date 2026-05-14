const DEFAULTS = {
  lat: 20,
  lon: 0,
  zoom: 2,
  layers: ['risk', 'alerts'],
  since: '24h',
  basemap: 'dark',
};

const listeners = new Set();

function parseLayers(raw) {
  if (!raw) return DEFAULTS.layers.slice();
  return raw.split(',').filter(Boolean);
}

function clampNum(n, fallback) {
  const x = parseFloat(n);
  return Number.isFinite(x) ? x : fallback;
}

function readFromUrl() {
  const p = new URLSearchParams(location.search);
  return {
    lat:     clampNum(p.get('lat'),  DEFAULTS.lat),
    lon:     clampNum(p.get('lon'),  DEFAULTS.lon),
    zoom:    clampNum(p.get('zoom'), DEFAULTS.zoom),
    layers:  parseLayers(p.get('layers')),
    since:   p.get('since')   || DEFAULTS.since,
    basemap: p.get('basemap') || DEFAULTS.basemap,
  };
}

export const state = readFromUrl();

let writeTimer = null;
function scheduleWrite() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    const p = new URLSearchParams();
    p.set('lat',     state.lat.toFixed(4));
    p.set('lon',     state.lon.toFixed(4));
    p.set('zoom',    state.zoom.toFixed(2));
    p.set('layers',  state.layers.join(','));
    p.set('since',   state.since);
    p.set('basemap', state.basemap);
    history.replaceState(null, '', '?' + p.toString());
  }, 250);
}

export function update(patch) {
  Object.assign(state, patch);
  scheduleWrite();
  listeners.forEach(fn => fn(state, patch));
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hasLayer(name) {
  return state.layers.includes(name);
}

export function toggleLayer(name, enabled) {
  const set = new Set(state.layers);
  if (enabled) set.add(name); else set.delete(name);
  update({ layers: [...set] });
}

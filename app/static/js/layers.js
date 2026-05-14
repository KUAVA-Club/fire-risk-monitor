import { map, riskLayer, landcoverLayer, alertsLayer } from './map.js';
import { state, hasLayer, onChange } from './state.js';
import { fetchAlerts } from './api.js';
import { alertCssClass } from './risk.js';

const LAYER_REFS = {
  risk:      riskLayer,
  landcover: landcoverLayer,
  alerts:    alertsLayer,
};

function syncLayerVisibility() {
  for (const [name, group] of Object.entries(LAYER_REFS)) {
    const on = hasLayer(name);
    if (on && !map.hasLayer(group)) map.addLayer(group);
    if (!on && map.hasLayer(group)) map.removeLayer(group);
  }
}

let alertsAbortKey = 0;
export async function refreshAlerts() {
  if (!hasLayer('alerts')) {
    alertsLayer.clearLayers();
    return [];
  }
  const myKey = ++alertsAbortKey;
  let alerts = [];
  try {
    alerts = await fetchAlerts(state.since);
  } catch (e) {
    console.error('alerts fetch failed', e);
    return [];
  }
  if (myKey !== alertsAbortKey) return [];

  alertsLayer.clearLayers();
  alerts.forEach(a => {
    if (a.lat == null || a.lon == null) return;
    const icon = L.divIcon({
      className: '',
      html: `<div class="alert-marker ${alertCssClass(a.level)}"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    const m = L.marker([a.lat, a.lon], { icon }).addTo(alertsLayer);
    m.bindPopup(`
      <div style="min-width:170px;">
        <div style="color:var(--muted); font-size:10px; letter-spacing:.08em; text-transform:uppercase;">Alert · ${a.level}</div>
        <div style="font-family:var(--mono); font-size:11px; margin-top:4px;">${a.lat.toFixed(4)}, ${a.lon.toFixed(4)}</div>
        <div style="margin-top:6px; font-size:12px;">FRI <b>${a.fri != null ? a.fri.toFixed(1) : '—'}</b></div>
        <div style="color:var(--muted); font-size:11px; margin-top:4px;">${a.triggered_at}</div>
      </div>
    `);
  });
  return alerts;
}

export function initLayers() {
  syncLayerVisibility();
  onChange((_, patch) => {
    if (patch.layers) syncLayerVisibility();
    if (patch.since)  refreshAlerts();
  });
}

export { syncLayerVisibility };

import { drawHexGrid } from './map.js';
import { initLayers, refreshAlerts } from './layers.js';
import {
  buildLegend,
  wireLayerToggles,
  wireTimeRange,
  wireBasemap,
  wireSearch,
  wireDetail,
  loadPersistedZones,
  setLastUpdated,
} from './ui.js';

function boot() {
  buildLegend();
  wireBasemap();
  wireLayerToggles();
  wireTimeRange();
  wireSearch();
  wireDetail();
  initLayers();
  loadPersistedZones();

  drawHexGrid();
  refreshAlerts().then(setLastUpdated);

  setInterval(() => {
    refreshAlerts();
    setLastUpdated();
  }, 60_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

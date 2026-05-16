const FRM_VERSION = 'v6';
console.log(`%c[FRM ${FRM_VERSION}] frontend loaded`, 'color:#ff6b35;font-weight:600');

import { drawHexGrid } from './map.js';
import { initLayers, refreshAlerts } from './layers.js';
import {
  buildLegend,
  wireLayerToggles,
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

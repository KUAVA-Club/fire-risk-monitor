// ============================================================
// DATA FETCHING
// ============================================================

// Fetches weather/fire data for a specific lat/lon from the backend
async function fetchFireData(lat, lon) {
  try {
    const response = await fetch(`/fire/data?lat=${lat}&lon=${lon}`);
    const data = await response.json();
    return {
      temp:       data.temp       ?? "Err",
      wind_speed: data.wind_speed ?? "Err"
    };
  } catch (error) {
    console.error(error);
    return { temp: "Err", wind_speed: "Err" };
  }
}

// Loads pre-computed danger zones from the backend and paints them on the map at startup
async function fetchAndLoadDangerZones() {
  try {
    const response = await fetch('/fire/dangerZones');
    const zones = await response.json();

    for (const zone of zones) {
      const lat = zone.lat ?? zone.latitude;
      const lng = zone.lon ?? zone.longitude ?? zone.lng;
      const fri = zone.fri ?? getFRIFromData(zone.temp, zone.wind_speed);

      if (lat == null || lng == null || fri == null) continue;

      const style = getFRIStyle(fri);
      const key   = cellKey(lat, lng);

      clickedCells[key] = { fri, style };

      // Only show in the sidebar if risk is high enough
      if (fri >= 70) {
        addToSidebar(lat, lng, fri, style);
      }
    }

    drawGrid();

  } catch (error) {
    console.error('Failed to load danger zones:', error);
  }
}


// ============================================================
// FIRE RISK INDEX (FRI) LOGIC
// ============================================================

// Calculates FRI (0–100) from temperature and wind speed
// Weighted: temp counts 60%, wind 40%
function getFRIFromData(temp, windSpeed) {
  if (temp === "Err" || windSpeed === "Err") return null;
  return Math.min(100, (temp * 0.6) + (windSpeed * 0.4));
}

// Maps an FRI score to a color, risk label, and recommended action
function getFRIStyle(fri) {
  if (fri <= 24) return { color: "#00ff00", label: "LOW",       action: "Log only (review EOD)" };
  if (fri <= 49) return { color: "#ffff00", label: "MODERATE",  action: "Daily digest + forecast review" };
  if (fri <= 69) return { color: "#ffa500", label: "HIGH",      action: "Immediate email alert" };
  if (fri <= 84) return { color: "#ff0000", label: "VERY HIGH", action: "SMS + dispatch prep" };
  return          { color: "#8B0000",       label: "EXTREME",   action: "All channels + evacuation readiness" };
}


// ============================================================
// CELL STATE TRACKING
// ============================================================

// Stores cells the user has clicked and their FRI data, keyed by lat/lng
var clickedCells = {};

// Unique string key for a grid cell based on its center coordinates
function cellKey(lat, lng) {
  return lat.toFixed(5) + ',' + lng.toFixed(5);
}


// ============================================================
// SIDEBAR
// ============================================================

// Keeps track of zones shown in the sidebar so we don't add duplicates
var dangerousZones = [];

// Adds a high-risk zone card to the sidebar panel
function addToSidebar(lat, lng, fri, style) {
  var key = cellKey(lat, lng);
  var exists = dangerousZones.some(z => z.key === key);
  if (exists) return;

  dangerousZones.push({ key, lat, lng, fri, style });
  document.getElementById('sidebar-empty').style.display = 'none';

  var card = document.createElement('div');
  card.className = 'zone-card';
  card.style.borderColor = style.color;
  card.innerHTML =
    '<span class="zone-label" style="color:' + style.color + '">' + style.label + '</span><br>' +
    'FRI: ' + fri.toFixed(1) + '<br>' +
    '🌍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '<br>' +
    '⚙️ ' + style.action;

  document.getElementById('zone-list').appendChild(card);
}

// Rebuilds the sidebar from scratch (used when a zone is removed)
function rebuildSidebar() {
  var list = document.getElementById('zone-list');
  list.innerHTML = '';
  dangerousZones.forEach(function(z) {
    var card = document.createElement('div');
    card.className = 'zone-card';
    card.style.borderColor = z.style.color;
    card.innerHTML =
      '<span class="zone-label" style="color:' + z.style.color + '">' + z.style.label + '</span><br>' +
      'FRI: ' + z.fri.toFixed(1) + '<br>' +
      '🌍 ' + z.lat.toFixed(5) + ', ' + z.lng.toFixed(5) + '<br>' +
      '⚙️ ' + z.style.action;
    list.appendChild(card);
  });
  document.getElementById('sidebar-empty').style.display =
    dangerousZones.length === 0 ? 'block' : 'none';
}


// ============================================================
// MAP SETUP
// ============================================================

// Initialize the Leaflet map centered on the world
var map = L.map('map', {
  preferCanvas: true,
  minZoom: 2
}).setView([20, 0], 2);

// Use OpenTopoMap tiles for a terrain-style basemap
L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenTopoMap'
}).addTo(map);

// Separate layer group for the grid so we can clear and redraw it easily
var gridLayer = L.layerGroup().addTo(map);


// ============================================================
// GRID DRAWING
// ============================================================

// Returns the appropriate cell size (in degrees) based on current zoom level
function getGridSize() {
  var zoom = map.getZoom();
  if (zoom <= 3)  return 10;
  if (zoom <= 5)  return 5;
  if (zoom <= 7)  return 1;
  if (zoom <= 9)  return 0.5;
  if (zoom <= 11) return 0.1;
  return 0.05;
}

// The smallest grid resolution — clicking a cell at this size triggers a data fetch
var FINEST_SIZE = 0.05;

// If set, draws a 3x3 focused grid around a specific location instead of the full viewport
var focusGrid = null;

// Main grid drawing function — clears and redraws all visible cells
function drawGrid() {
  gridLayer.clearLayers();
  const gridSize = getGridSize();

  if (focusGrid) {
    // Draw a tight 3x3 grid centered on the focused location
    const { lat, lng, size } = focusGrid;
    const north = lat + size * 1.5;
    const south = lat - size * 1.5;
    const west  = lng - size * 1.5;
    const east  = lng + size * 1.5;

    for (let i = 0; i < 3; i++) {
      const latStep = north - size * (i + 1);
      for (let j = 0; j < 3; j++) {
        const lngStep = west + size * j;
        drawCell(latStep, lngStep, size);
      }
    }
  } else {
    // Draw a grid covering the entire visible map area
    const bounds = map.getBounds();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const west  = bounds.getWest();
    const east  = bounds.getEast();

    for (let lat = south; lat < north; lat += gridSize) {
      for (let lng = west; lng < east; lng += gridSize) {
        drawCell(lat, lng, gridSize);
      }
    }
  }
}

// Draws a single grid cell rectangle and wires up its click behavior
function drawCell(lat, lng, gs) {
  const centerLat = lat + gs / 2;
  const centerLng = lng + gs / 2;
  const key = cellKey(centerLat, centerLng);
  const saved = clickedCells[key]; // Check if this cell already has FRI data

  const cellBounds = [
    [lat, lng],
    [lat + gs, lng + gs]
  ];

  // Color the cell if it has saved data, otherwise show it as a dim placeholder
  const rect = L.rectangle(cellBounds, {
    color:       saved ? saved.style.color : "#555",
    weight: 1,
    fillColor:   saved ? saved.style.color : "#555",
    fillOpacity: saved ? 0.45 : 0.15
  }).addTo(gridLayer);

  // IIFE used here to capture the current loop variables in the async click handler
  (function(cb, lat, lng, gs, rect) {
    rect.on('click', async function(e) {
      L.DomEvent.stopPropagation(e);

      if (gs <= FINEST_SIZE) {
        // Finest zoom: clicking fetches real fire data for that cell
        const centerLat = lat + gs / 2;
        const centerLng = lng + gs / 2;
        const key = cellKey(centerLat, centerLng);

        // If already clicked, toggle it off and remove from sidebar
        if (clickedCells[key]) {
          delete clickedCells[key];
          rect.setStyle({ color: "#555", fillColor: "#555", fillOpacity: 0.15 });
          dangerousZones = dangerousZones.filter(z => z.key !== key);
          rebuildSidebar();
          return;
        }

        // Fetch fire data, compute FRI, and color the cell accordingly
        const data = await fetchFireData(centerLat, centerLng);
        const fri = getFRIFromData(data.temp, data.wind_speed);
        const style = fri !== null
          ? getFRIStyle(fri)
          : { color: "#555", label: "No data", action: "Backend unreachable" };

        clickedCells[key] = { fri, style };
        rect.setStyle({ color: style.color, fillColor: style.color, fillOpacity: 0.45 });

        if (fri !== null && fri >= 70) {
          addToSidebar(centerLat, centerLng, fri, style);
        }

        // Show a popup with the full breakdown for this cell
        const tempDisplay = (data.temp !== "Err") ? data.temp.toFixed(1) + ' °C' : 'Err';
        const windDisplay = (data.wind_speed !== "Err") ? data.wind_speed.toFixed(1) + ' km/h' : 'Err';
        const friDisplay  = (fri !== null) ? 'FRI: ' + fri.toFixed(1) + ' (' + style.label + ')' : 'FRI: N/A';

        L.popup()
          .setLatLng([centerLat, centerLng])
          .setContent(
            '<div style="font-family:monospace;font-size:13px;line-height:1.7">' +
            '<b>🔥 Fire Risk Cell</b><br>' +
            friDisplay + '<br>' +
            '⚙️ Action: ' + style.action + '<br>' +
            '🌍 Lat: ' + centerLat.toFixed(5) + '<br>' +
            '🌍 Lng: ' + centerLng.toFixed(5) + '<br>' +
            '🌡️ Temperature: ' + tempDisplay + '<br>' +
            '💨 Wind Speed: ' + windDisplay +
            '</div>'
          )
          .openOn(map);
      } else {
        // Coarser zoom: clicking zooms into that cell instead of fetching data
        map.fitBounds(cb, { animate: true, padding: [10, 10] });
      }
    });
  })(cellBounds, lat, lng, gs, rect);
}


// ============================================================
// MAP EVENTS & CONTROLS
// ============================================================

// Redraw the grid whenever the user pans or zooms
drawGrid();
map.on('moveend zoomend', drawGrid);

// "Go" button: fly to entered coordinates and show a focused 3x3 grid
document.getElementById('go-btn').onclick = function () {
  const lat = parseFloat(document.getElementById('lat-input').value);
  const lng = parseFloat(document.getElementById('lng-input').value);

  if (isNaN(lat) || isNaN(lng)) {
    alert("Invalid coordinates");
    return;
  }

  const size = FINEST_SIZE;
  focusGrid = { lat, lng, size };

  map.flyTo([lat, lng], 12, {
    animate: true,
    duration: 1.5
  });

  drawGrid();
};

// Load any pre-existing danger zones from the server when the page first opens
fetchAndLoadDangerZones();
// async function fetchFireData(lat, lon) {
//   const randomValue = () => Math.floor(70 + Math.random() * 21); // 70-90 inclusive

//   return {
//     temp: randomValue(),
//     wind_speed: randomValue()
//   };
// }


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

      if (fri >= 70) {
        addToSidebar(lat, lng, fri, style);
      }
    }

    drawGrid();

  } catch (error) {
    console.error('Failed to load danger zones:', error);
  }
}

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

function getFRIFromData(temp, windSpeed) {
  if (temp === "Err" || windSpeed === "Err") return null;
  return Math.min(100, (temp * 0.6) + (windSpeed * 0.4));
}

function getFRIStyle(fri) {
  if (fri <= 24) return { color: "#00ff00", label: "LOW",       action: "Log only (review EOD)" };
  if (fri <= 49) return { color: "#ffff00", label: "MODERATE",  action: "Daily digest + forecast review" };
  if (fri <= 69) return { color: "#ffa500", label: "HIGH",      action: "Immediate email alert" };
  if (fri <= 84) return { color: "#ff0000", label: "VERY HIGH", action: "SMS + dispatch prep" };
  return          { color: "#8B0000",       label: "EXTREME",   action: "All channels + evacuation readiness" };
}

var clickedCells = {};

function cellKey(lat, lng) {
  return lat.toFixed(5) + ',' + lng.toFixed(5);
}

var dangerousZones = [];

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

var map = L.map('map', {
  preferCanvas: true,
  minZoom: 2
}).setView([20, 0], 2);
L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenTopoMap'
}).addTo(map);

var gridLayer = L.layerGroup().addTo(map);

function getGridSize() {
  var zoom = map.getZoom();
  if (zoom <= 3)  return 10;
  if (zoom <= 5)  return 5;
  if (zoom <= 7)  return 1;
  if (zoom <= 9)  return 0.5;
  if (zoom <= 11) return 0.1;
  return 0.05;
}

var FINEST_SIZE = 0.05;

var focusGrid = null;

function drawGrid() {
  gridLayer.clearLayers();
  const gridSize = getGridSize();
  let bounds;

  if (focusGrid) {
    const { lat, lng, size } = focusGrid;

    const north = lat + size * 1.5;
    const south = lat - size * 1.5;
    const west  = lng - size * 1.5;
    const east  = lng + size * 1.5;

    bounds = L.latLngBounds([south, west], [north, east]);

    for (let i = 0; i < 3; i++) {
      const latStep = north - size * (i + 1);
      for (let j = 0; j < 3; j++) {
        const lngStep = west + size * j;
        drawCell(latStep, lngStep, size);
      }
    }
  } else {
    bounds = map.getBounds();
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

function drawCell(lat, lng, gs) {
  const centerLat = lat + gs / 2;
  const centerLng = lng + gs / 2;
  const key = cellKey(centerLat, centerLng);
  const saved = clickedCells[key];

  const cellBounds = [
    [lat, lng],
    [lat + gs, lng + gs]
  ];

  const rect = L.rectangle(cellBounds, {
    color:       saved ? saved.style.color : "#555",
    weight: 1,
    fillColor:   saved ? saved.style.color : "#555",
    fillOpacity: saved ? 0.45 : 0.15
  }).addTo(gridLayer);

  // attach your existing click handler
  (function(cb, lat, lng, gs, rect) {
    rect.on('click', async function(e) {
      L.DomEvent.stopPropagation(e);

      if (gs <= FINEST_SIZE) {
        const centerLat = lat + gs / 2;
        const centerLng = lng + gs / 2;
        const key = cellKey(centerLat, centerLng);

        if (clickedCells[key]) {
          delete clickedCells[key];
          rect.setStyle({ color: "#555", fillColor: "#555", fillOpacity: 0.15 });
          dangerousZones = dangerousZones.filter(z => z.key !== key);
          rebuildSidebar();
          return;
        }

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
        map.fitBounds(cb, { animate: true, padding: [10, 10] });
      }
    });
  })(cellBounds, lat, lng, gs, rect);
}

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

drawGrid();
map.on('moveend zoomend', drawGrid);

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

fetchAndLoadDangerZones();

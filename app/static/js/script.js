async function fetchFireData(lat, lon) {
  try {
    const response = await fetch(`/fire/data?lat=${lat}&lon=${lon}`);
    if (!response.ok) throw new Error("Backend not responding");
    const data = await response.json();
    return {
      is_relevant: data.is_relevant,
      land_cover: data.land_cover,
      reason: data.reason || null,
      temp: data.temp,
      wind_speed: data.wind_speed,
      risk_index: data.risk_index,
      alert_level: data.alert_level
    };
  } catch (error) {
    console.error("Connection failed", error);
    return null;
  }
}

// MOCK: replace real backend fetch with random test data
// async function fetchFireData(lat, lon) {
//   await new Promise(r => setTimeout(r, 150)); // simulate network delay

//   const risk_index  = Math.random() * 100;       // 0–100
//   const temp        = 15 + Math.random() * 45;   // 15–60 °C
//   const wind_speed  = Math.random() * 120;        // 0–120 km/h

//   const level = RISK_LEVELS.find(l => risk_index >= l.min);
//   const alert_level = level ? level.label : "LOW";

//   return {
//     temp: +temp.toFixed(1),
//     wind_speed: +wind_speed.toFixed(1),
//     risk_index: +risk_index.toFixed(2),
//     alert_level
//   };
// }

const RISK_LEVELS = [
  { min: 85, color: "#8B0000", label: "EXTREME",   action: "All channels + evacuation readiness" },
  { min: 70, color: "#ff0000", label: "VERY HIGH", action: "SMS + dispatch prep" },
  { min: 50, color: "#ffa500", label: "HIGH",      action: "Immediate email alert" },
  { min: 25, color: "#ffff00", label: "MODERATE",  action: "Daily digest + forecast review" },
  { min: 0,  color: "#00ff00", label: "LOW",       action: "Log only (review EOD)" }
];

async function fetchAndLoadDangerZones() {
  var foundSomeData = false;
  try {
    const response = await fetch('/fire/dangerZones');
    const zones = await response.json();
    for (const zone of zones) {
      const lat = zone.lat ?? zone.latitude;
      const lng = zone.lon ?? zone.longitude ?? zone.lng;
      const fri = zone.fri ?? getFRIFromData(zone.temp, zone.wind_speed);

      if (lat == null || lng == null || fri == null) continue;
      foundSomeData = true;
      const style = getFRIStyle(fri);
      const key   = cellKey(lat, lng);

      clickedCells[key] = { fri, style };

      // Only show in the sidebar if risk is high enough
      if (fri >= 70) {
        addToSidebar(lat, lng, fri, style);
      }
    }

    if (!foundSomeData) {
      document.getElementById("sidebar-empty").textContent = "No serious fire risks are present.";
    }

    drawGrid();

  } catch (error) {
    console.error('Failed to load danger zones:', error);
  }
}

const DEFAULT_STYLE = RISK_LEVELS[RISK_LEVELS.length - 1];

function getFRIFromData(temp, windSpeed) {
  if (temp === "Err" || windSpeed === "Err") return null;
  return Math.min(100, (temp * 0.6) + (windSpeed * 0.4));
}

function getFRIStyle(fri) {
  const style = RISK_LEVELS.find(level => fri >= level.min);
  return style || DEFAULT_STYLE;
}

var clickedCells = {};

function cellKey(lat, lng) {
  return lat.toFixed(5) + ',' + lng.toFixed(5);
}

var dangerousZones = [];

function createCardElement(lat, lng, fri, style) {
  var card = document.createElement('div');
  card.className = 'zone-card';
  card.style.borderColor = style.color;
  card.style.cursor = 'pointer'; 

  card.innerHTML =
    '<span class="zone-label" style="color:' + style.color + '">' + style.label + '</span><br>' +
    'FRI: ' + fri.toFixed(1) + '<br>' +
    '🌍 ' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '<br>' +
    '⚙️ ' + style.action;

  card.onclick = function() {
    focusGrid = { lat: lat, lng: lng, size: FINEST_SIZE };
    isFlying = true;

    document.getElementById('lat-input').value = lat.toFixed(5);
    document.getElementById('lng-input').value = lng.toFixed(5);

    map.flyTo([lat, lng], 12, { animate: true, duration: 1.5 });

    setTimeout(() => {
      L.popup({ autoPan: false, closeButton: true })
        .setLatLng([lat, lng])
        .setContent(`
          <div style="font-family:monospace;font-size:13px;line-height:1.7">
            <b>🔥 Fire Risk: ${style.label}</b><br>
            FRI: ${fri.toFixed(2)}<br>
            ⚙️ Action: ${style.action}<br>
            🌍 Location: ${lat.toFixed(5)}, ${lng.toFixed(5)}
          </div>
        `)
        .openOn(map);
    }, 1500);
  };

  return card;
}

function addToSidebar(lat, lng, fri, style) {
  var key = cellKey(lat, lng);
  var exists = dangerousZones.some(z => z.key === key);
  if (exists) return;

  dangerousZones.push({ key, lat, lng, fri, style });
  document.getElementById('sidebar-empty').style.display = 'none';

  var card = createCardElement(lat, lng, fri, style);
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
  if (!map) return;
  gridLayer.clearLayers();
  
  if (focusGrid) {
    const { lat, lng, size } = focusGrid;
    const startLat = lat - (size * 1.5);
    const startLng = lng - (size * 1.5);

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        drawCell(startLat + (i * size), startLng + (j * size), size);
      }
    }
    return; 
  }

  const gridSize = getGridSize();
  const bounds = map.getBounds();
  
  const south = Math.floor(bounds.getSouth() / gridSize) * gridSize;
  const north = Math.ceil(bounds.getNorth() / gridSize) * gridSize;
  const west = Math.floor(bounds.getWest() / gridSize) * gridSize;
  const east = Math.ceil(bounds.getEast() / gridSize) * gridSize;

  for (let lt = south; lt < north; lt += gridSize) {
    for (let ln = west; ln < east; ln += gridSize) {
      drawCell(lt, ln, gridSize);
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

  rect.on('click', async function(e) {
    L.DomEvent.stopPropagation(e);

    if (gs > FINEST_SIZE) return;

    if (clickedCells[key]) {
      delete clickedCells[key];
      rect.setStyle({ color: "#555", fillColor: "#555", fillOpacity: 0.15 });
      dangerousZones = dangerousZones.filter(z => z.key !== key);
      rebuildSidebar();
      return;
    }

    rect.setStyle({ color: "#3388ff", fillOpacity: 0.6 });

    const data = await fetchFireData(centerLat, centerLng);
    
    if (data) {

      if (data.is_relevant === false) { 
  
        const bgColor = "#6c757d"; 
        const icon = "⛔️";     
      
        rect.setStyle({ 
          color: bgColor, 
          fillColor: bgColor, 
          fillOpacity: 0.5 
        });

        //console.log("Showing Not Applicable popup at:", centerLat, centerLng);
      
        const popupContent = `
          <div style="font-family: monospace;text-align:center; padding: 10px; min-width: 160px;">
            <div style="font-size: 24px; margin-bottom: 5px;">${icon}</div>
            <b style="color: ${bgColor}; font-size: 14px; text-transform: uppercase;">Not Applicable</b><br>
            <span style="color: #444; font-weight: bold; font-size: 13px;">${data.land_cover}</span><br>
            <hr style="border:0; border-bottom:1px solid #eee; margin: 10px 0;">
            <span style="color: #888; font-size: 11px;">Fire risk monitoring is disabled for this terrain type.</span>
          </div>
        `;

        rect.bindPopup(popupContent).openPopup();
        
        return; 
      }

      // --- ORIGINAL FIRE RISK LOGIC CONTINUES ---
      const fri = data.risk_index; 
      const style = getFRIStyle(fri);
      style.label = data.alert_level;

      clickedCells[key] = { fri, style };
      rect.setStyle({ color: style.color, fillColor: style.color, fillOpacity: 0.45 });

      if (fri >= 70) {
        addToSidebar(centerLat, centerLng, fri, style);
      }

      L.popup({ autoPan: false, closeButton: true })
        .setLatLng([centerLat, centerLng])
        .setContent(`
          <div style="font-family:monospace;font-size:13px;line-height:1.7">
            <b>🔥 Fire Risk: ${data.alert_level}</b><br>
            🪨 Terrain: ${data.land_cover}<br>
            #️⃣ FRI: ${fri.toFixed(2)}<br>
            ⚙️ Action: ${style.action}<br>
            🌡️ Temp: ${data.temp} C<br>
            🌬️ Wind: ${data.wind_speed} km/h
          </div>
        `)
        .openOn(map);
    } else {
      rect.setStyle({ color: "#ff0000", fillOpacity: 0.3 });
      alert("Backend unreachable");
    }
  });
}

function rebuildSidebar() {
  var list = document.getElementById('zone-list');
  list.innerHTML = '';
  dangerousZones.forEach(function(z) {
    var card = createCardElement(z.lat, z.lng, z.fri, z.style);
    list.appendChild(card);
  });
  document.getElementById('sidebar-empty').style.display =
    dangerousZones.length === 0 ? 'block' : 'none';
}

drawGrid();

let isFlying = false;

document.getElementById('go-btn').onclick = function (e) {
  if (e) e.preventDefault();
  const lat = parseFloat(document.getElementById('lat-input').value);
  const lng = parseFloat(document.getElementById('lng-input').value);

  if (isNaN(lat) || isNaN(lng)) return;
  if ((lat < 90) && (lat > -90) && (lng < 180) && (lng > -180) ) {
    isFlying = true; 
    focusGrid = { lat, lng, size: FINEST_SIZE };
  
    map.flyTo([lat, lng], 12, { animate: true, duration: 1.5 });
  } else {
    alert("Invalid longtitude / latitude")
    document.getElementById('lat-input').value = '';
    document.getElementById('lng-input').value = '';
  }
};

map.on('moveend', function() {
  isFlying = false; 
  drawGrid();
});

document.getElementById('reset-btn').onclick = function (e) {
  if (e) e.preventDefault();

  focusGrid = null;

  document.getElementById('lat-input').value = '';
  document.getElementById('lng-input').value = '';
  gridLayer.clearLayers();
  map.closePopup();

  map.flyTo([20, 0], 2, {
    animate: true,
    duration: 1
  });
};

var legend = L.control({position: 'bottomright'});

legend.onAdd = function (map) {
  var div = L.DomUtil.create('div', 'info legend');
  div.innerHTML = '<strong style="display:block; margin-bottom: 5px;">Risk Level (FRI)</strong>';

  [...RISK_LEVELS].reverse().forEach((level, index, array) => {
    const nextLevel = array[index + 1];
    const rangeLabel = nextLevel ? `${level.min}&ndash;${nextLevel.min - 1}` : `${level.min}+`;
    
    div.innerHTML += `
      <i style="background:${level.color}"></i> 
      ${rangeLabel} (${level.label})<br>
    `;
  });

  return div;
};

legend.addTo(map);

fetchAndLoadDangerZones();
// Create map
var map = L.map('map', {
  preferCanvas: true,
  minZoom: 2
}).setView([20, 0], 2);

L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenTopoMap'
}).addTo(map);

// grid layer
var gridLayer = L.layerGroup().addTo(map);

// dynamic grid size depending on zoom
function getGridSize() {
  var zoom = map.getZoom();
  if (zoom <= 3)  return 10;
  if (zoom <= 5)  return 5;
  if (zoom <= 7)  return 1;
  if (zoom <= 9)  return 0.5;
  if (zoom <= 11) return 0.1;
  return 0.05; // finest level
}

var FINEST_SIZE = 0.05;

function drawGrid() {
  gridLayer.clearLayers();

  var gridSize = getGridSize();
  var bounds = map.getBounds();
  var south = Math.floor(bounds.getSouth() / gridSize) * gridSize;
  var north = bounds.getNorth();
  var west  = Math.floor(bounds.getWest()  / gridSize) * gridSize;
  var east  = bounds.getEast();

  for (let lat = south; lat <= north; lat += gridSize) {
    for (let lng = west; lng <= east; lng += gridSize) {
      var cellBounds = [
        [lat, lng],
        [lat + gridSize, lng + gridSize]
      ];

      var rect = L.rectangle(cellBounds, {
        color: "#555",
        weight: 1,
        fillOpacity: 0
      }).addTo(gridLayer);

      (function(cb, lat, lng, gs) {
        rect.on('click', function(e) {
          L.DomEvent.stopPropagation(e);

          if (gs <= FINEST_SIZE) {
            // At finest grid — show popup with center coords
            var centerLat = lat + gs / 2;
            var centerLng = lng + gs / 2;
            L.popup()
              .setLatLng([centerLat, centerLng])
            .setContent(
              '<div style="font-family:monospace;font-size:13px;line-height:1.7">' +
              '<b>Cell Center</b><br>' +
              '&#127757; Lat: ' + centerLat.toFixed(5) + '<br>' +
              '&#127757; Lng: ' + centerLng.toFixed(5) + '<br>' +
              '&#128293; Temperature: <span id="popup-temp">{{temp}}</span> °C<br>' +
              '&#127788; Wind Speed: <span id="popup-wind">{{wind_speed}}</span> km/h<br>' +
              '</div>'
            )
              .openOn(map);
          } else {
            // Zoom into this cell
            map.fitBounds(cb, { animate: true, padding: [10, 10] });
          }
        });
      })(cellBounds, lat, lng, gridSize);
    }
  }
}

// draw grid initially
drawGrid();

// redraw grid on movement and zoom
map.on('moveend zoomend', drawGrid);
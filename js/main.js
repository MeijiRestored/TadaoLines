const map = L.map('map', {zoomControl: false}).setView([50.4377, 2.8183], 12);
L.tileLayer('https://tile.tracestrack.com/fr/{z}/{x}/{y}.png?key=8c4267e8a3026ab8626b0ef7a7886842', {
  minZoom: 2,
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// Overpass API request
const overpassUrl = 'https://overpass.private.coffee/api/interpreter?data=[out:json];rel["route"="bus"]["network"="Tadao"];(._;node(r:"platform_exit_only");way(r);node(w););(._;node(r:"platform");way(r);node(w););(._;node(r:"platform_entry_only");way(r);node(w););out body geom;';

axios.get(overpassUrl).then(response => {
  const data = response.data;

  const loadingMessage = document.getElementById('loading-message');
  loadingMessage.style.display = 'none';

  const nodes = {};
  const ways = {};
  const routes = {};

  data.elements.forEach(element => {
    if (element.type === 'node') {
      nodes[element.id] = element;
    } else if (element.type === 'way') {
      ways[element.id] = element;
    } else if (element.type === 'relation') {
      routes[element.id] = element;
    }
  });

  function createMarkerIcon(size) {
    return L.icon({
      iconUrl: "assets/stop.png",
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  const initialIconSize = 16;

  let stopsLayerGroup = L.layerGroup();

  const markers = Object.values(nodes).map(node => {
    const stopName = node.tags.name || 'Inconnu';
    const connectedRoutes = new Set();

    Object.values(routes).forEach(route => {
      route.members.forEach(member => {
        if (member.ref === node.id && member.role.startsWith("platform")) {
          connectedRoutes.add(`<span style="background-color: ${route.tags.colour}; color: #ffffff; padding: 3px; border-radius: 4px; font-weight: bold">${route.tags.ref}</span>`);
        }
      });
    });

    const uniqueConnectedRoutes = Array.from(connectedRoutes);

    const popupContent = `<b>${stopName}</b><br><br>Lignes: ${uniqueConnectedRoutes.join(' ')}`;
    return L.marker([node.lat, node.lon], {icon: createMarkerIcon(initialIconSize)}).addTo(stopsLayerGroup).bindPopup(popupContent);
  });

  function updateMarkerIcons() {
    const zoomLevel = map.getZoom();
    const newSize = initialIconSize / 3 * ((zoomLevel - 10 <= 0 ? 1 : zoomLevel - 10) * 0.7); // Adjust the divisor to control scaling

    markers.forEach(marker => {
      marker.setIcon(createMarkerIcon(newSize));
    });
  }

  map.on('zoomend', updateMarkerIcons);

  updateMarkerIcons();

  const navLineStyle = (route) => ({color: route.tags.colour, weight: 3});
  const regularLineStyle = (route) => ({
    color: route.tags.colour,
    weight: (!route.tags.note || !route.tags.note.includes("alternatif")) ? 4 : 3,
    dashArray: (!route.tags.note || !route.tags.note.includes("alternatif")) ? '1' : '10, 10'
  });
  const bulleBaseLineStyle = () => ({color: "#FFFFFF", weight: 10});
  const bulleLineStyle = (route) => ({
    color: route.tags.colour,
    weight: (!route.tags.note || !route.tags.note.includes("alternatif")) ? 6 : 3,
    dashArray: (!route.tags.note || !route.tags.note.includes("alternatif")) ? '1' : '10, 10'
  });

  let lineLayers = {};
  let routeMapping = {};
  let lineVisibility = {};

  function extractNumericRef(route) {
    const ref = route.tags.ref;

    if (ref.startsWith("B")) {
      const numericRef = parseInt(ref.substring(1));
      return isNaN(numericRef) ? 999 : numericRef;
    }

    const numericRef = parseInt(ref.replace(/\D/g, ''));

    if (!isNaN(numericRef)) {
      return numericRef;
    }

    const altRef = route.tags.alt_ref ? parseInt(route.tags.alt_ref) : 999;
    return isNaN(altRef) ? 999 : altRef;
  }

  function drawPolyline(routes) {
    Object.values(routes).forEach(route => {
      const ref = route.tags.ref;

      if (!lineLayers[ref]) {
        lineLayers[ref] = L.layerGroup();
      }

      routeMapping[ref] = route;
      lineVisibility[ref] = true;

      let geom = [];
      route.members.forEach(member => {
        if (member.type === "way" && member.role === "") {
          geom.push(member.geometry);
        }
      });

      let style;
      if (ref.startsWith("Nav") || ref.startsWith("Allo")) {
        style = navLineStyle(route);
      } else if (!ref.startsWith("B") && parseInt(ref) >= 50) {
        style = regularLineStyle(route);
      } else if (!ref.startsWith("B") && parseInt(ref) <= 49 && parseInt(ref) >= 20) {
        style = regularLineStyle(route);
      } else if (!ref.startsWith("B") && parseInt(ref) <= 19 && parseInt(ref) >= 10) {
        style = regularLineStyle(route);
      } else if (ref.startsWith("B") && (!route.tags.note || !route.tags.note.includes("alternatif"))) {
        style = bulleBaseLineStyle(route);
        L.polyline(geom, style).addTo(lineLayers[ref]);
        style = bulleLineStyle(route);
      } else if (ref.startsWith("B")) {
        style = bulleLineStyle(route);
      }

      L.polyline(geom, style).addTo(lineLayers[ref]);
    });
  }

  drawPolyline(routes);

  const layerControlDiv = document.getElementById('layer-control');
  Object.keys(lineLayers)
    .sort((a, b) => {
      const aIsB = a.startsWith('B');
      const bIsB = b.startsWith('B');

      if (aIsB && bIsB) {
        return extractNumericRef(routeMapping[a]) - extractNumericRef(routeMapping[b]);
      }

      if (aIsB) return -1;
      if (bIsB) return 1;

      return extractNumericRef(routeMapping[b]) + extractNumericRef(routeMapping[a]);
    })
    .forEach(ref => {
      const route = routeMapping[ref];
      const lineItem = document.createElement('div');
      lineItem.className = 'layer-item';
      lineItem.innerHTML = `
      <input type="checkbox" id="${ref}" checked />
      <span class="linenumber" style="background-color: ${route.tags.colour};">${route.tags.ref}</span>
    `;

      lineItem.querySelector('input').addEventListener('click', function () {
        toggleLineVisibility(ref);
      });

      layerControlDiv.appendChild(lineItem);
    });

  stopsLayerGroup.addTo(map);

  function renderLines() {
    Object.keys(lineLayers).forEach(ref => {
      map.removeLayer(lineLayers[ref]);
    });

    Object.keys(lineLayers)
      .filter(ref => lineVisibility[ref])
      .sort((a, b) => extractNumericRef(routeMapping[b]) - extractNumericRef(routeMapping[a]))
      .forEach(ref => lineLayers[ref].addTo(map));
  }

  renderLines();

  function showAllLayers() {
    Object.keys(lineLayers).forEach(ref => {
      lineVisibility[ref] = true;
    });
    renderLines();
    const checkboxes = document.querySelectorAll('#layer-control input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  }

  function hideAllLayers() {
    Object.keys(lineLayers).forEach(ref => {
      lineVisibility[ref] = false;
    });
    renderLines();
    const checkboxes = document.querySelectorAll('#layer-control input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
  }

  function toggleLineVisibility(ref) {
    lineVisibility[ref] = !lineVisibility[ref];
    renderLines();
  }

  function toggleStopsVisibility() {
    if (map.hasLayer(stopsLayerGroup)) {
      map.removeLayer(stopsLayerGroup);
    } else {
      stopsLayerGroup.addTo(map);
    }
  }

  document.getElementById('show-all').addEventListener('click', showAllLayers);
  document.getElementById('hide-all').addEventListener('click', hideAllLayers);
  document.getElementById('toggle-stops').addEventListener('click', toggleStopsVisibility);
}).catch(error => {
  console.error('Erreur de téléchargement des données depuis Overpass API', error);
});

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

  let navLinesGroup = L.layerGroup();
  let duoLinesGroup = L.layerGroup();
  let complementaryLinesGroup = L.layerGroup();
  let principalLinesGroup = L.layerGroup();
  let bulleLinesGroup = L.layerGroup();

  function drawPolyline(routes, group, filterFn, lineStyleFn) {
    Object.values(routes).forEach(route => {
      route.members.forEach(member => {
        if (member.type === "way" && member.role === "" && filterFn(route, member)) {
          const style = lineStyleFn(route, member);
          L.polyline(member.geometry, style).addTo(group);
        }
      });
    });
  }

  const isNavLine = (route) => route.tags.ref.startsWith("Nav") || route.tags.ref.startsWith("Allo");
  const isDuoLine = (route) => !route.tags.ref.startsWith("B") && !route.tags.ref.startsWith("Nav") && !route.tags.ref.startsWith("Allo") && parseInt(route.tags.ref) >= 50;
  const isComplementaryLine = (route) => !route.tags.ref.startsWith("B") && !route.tags.ref.startsWith("Nav") && !route.tags.ref.startsWith("Allo") && parseInt(route.tags.ref) <= 49 && parseInt(route.tags.ref) >= 20;
  const isPrincipalLine = (route) => !route.tags.ref.startsWith("B") && !route.tags.ref.startsWith("Nav") && !route.tags.ref.startsWith("Allo") && parseInt(route.tags.ref) <= 19 && parseInt(route.tags.ref) >= 10;
  const isBulleBaseLine = (route) => route.tags.ref.startsWith("B") && (!route.tags.note || !route.tags.note.includes("alternatif"));
  const isBulleLine = (route) => route.tags.ref.startsWith("B");

  const navLineStyle = (route) => ({ color: route.tags.colour, weight: 3 });
  const regularLineStyle = (route) => ({ color: route.tags.colour, weight: (!route.tags.note || !route.tags.note.includes("alternatif")) ? 4 : 3 });
  const bulleBaseLineStyle = () => ({ color: "#FFFFFF", weight: 10 });
  const bulleLineStyle = (route) => ({ color: route.tags.colour, weight: (!route.tags.note || !route.tags.note.includes("alternatif")) ? 6 : 3 });

  drawPolyline(routes, navLinesGroup, isNavLine, navLineStyle);
  drawPolyline(routes, duoLinesGroup, isDuoLine, regularLineStyle);
  drawPolyline(routes, complementaryLinesGroup, isComplementaryLine, regularLineStyle);
  drawPolyline(routes, principalLinesGroup, isPrincipalLine, regularLineStyle);
  drawPolyline(routes, bulleLinesGroup, isBulleBaseLine, bulleBaseLineStyle);
  drawPolyline(routes, bulleLinesGroup, isBulleLine, bulleLineStyle);


  stopsLayerGroup.addTo(map);
  navLinesGroup.addTo(map);
  duoLinesGroup.addTo(map);
  complementaryLinesGroup.addTo(map);
  principalLinesGroup.addTo(map);
  bulleLinesGroup.addTo(map);

  L.control.layers(null, {
    "Arrets": stopsLayerGroup,
    "Navettes": navLinesGroup,
    "Lignes duo": duoLinesGroup,
    "Lignes complementaires": complementaryLinesGroup,
    "Lignes principales": principalLinesGroup,
    "Bulles": bulleLinesGroup
  }).addTo(map);


}).catch(error => {
  console.error('Erreur de téléchargement des données depuis Overpass API', error);
});

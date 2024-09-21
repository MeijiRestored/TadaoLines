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

  const markers = Object.values(nodes).map(node => {
    const stopName = node.tags.name || 'Unknown';
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
    return L.marker([node.lat, node.lon], {icon: createMarkerIcon(initialIconSize)}).addTo(map).bindPopup(popupContent);
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

  Object.values(routes).forEach(route => {
    route.members.forEach(member => {
      if (member.type === "way" && member.role === "" && !route.tags.ref.startsWith("B")) {
        L.polyline(member.geometry, {color: route.tags.colour, weight: 4}).addTo(map);
      }
    });
  });

  Object.values(routes).forEach(route => {
    route.members.forEach(member => {
      console.log(route.tags);
      if (member.type === "way" && member.role === "" && route.tags.ref.startsWith("B") && (!route.tags.note || !route.tags.note.includes("alternatif"))) {
        L.polyline(member.geometry, {color: "#FFFFFF", weight: 10}).addTo(map);
      }
    });
  });

  Object.values(routes).forEach(route => {
    route.members.forEach(member => {
      if (member.type === "way" && member.role === "" && route.tags.ref.startsWith("B")) {
        L.polyline(member.geometry, {color: route.tags.colour, weight: (!route.tags.note || !route.tags.note.includes("alternatif")) ? 6 : 3}).addTo(map);
      }
    });
  });


}).catch(error => {
  console.error('Error fetching data from Overpass API', error);
});

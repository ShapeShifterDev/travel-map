// routes.js
// One curved driving route: Guatemala City -> Antigua Guatemala
// Trimmed to start/end at the edge-center of the pin circles.
// Shows ONE car icon centered along the curve (rotated to direction of travel).

(function () {
  function pinCenterScreenPoint(map, lngLat, radiusPx) {
    const p = map.project({ lng: lngLat[0], lat: lngLat[1] });
    return { x: p.x, y: p.y - radiusPx }; // marker anchor is bottom
  }

  function trimToCircleEdges(map, aLngLat, bLngLat, aRadiusPx, bRadiusPx) {
    const aC = pinCenterScreenPoint(map, aLngLat, aRadiusPx);
    const bC = pinCenterScreenPoint(map, bLngLat, bRadiusPx);

    const dx = bC.x - aC.x;
    const dy = bC.y - aC.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const ux = dx / len;
    const uy = dy / len;

    const aE = { x: aC.x + ux * aRadiusPx, y: aC.y + uy * aRadiusPx };
    const bE = { x: bC.x - ux * bRadiusPx, y: bC.y - uy * bRadiusPx };

    const aLL = map.unproject(aE);
    const bLL = map.unproject(bE);

    return [[aLL.lng, aLL.lat], [bLL.lng, bLL.lat]];
  }

  function curvedLineScreenSpace(map, startLL, endLL, curvatureFactor = 0.18, minPx = 18, maxPx = 55, segments = 90) {
    const a = map.project({ lng: startLL[0], lat: startLL[1] });
    const b = map.project({ lng: endLL[0], lat: endLL[1] });

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const curvaturePx = Math.max(minPx, Math.min(maxPx, len * curvatureFactor));

    const px = -dy / len;
    const py = dx / len;

    const c = { x: mx + px * curvaturePx, y: my + py * curvaturePx };

    const coords = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const mt = 1 - t;

      const x = (mt * mt * a.x) + (2 * mt * t * c.x) + (t * t * b.x);
      const y = (mt * mt * a.y) + (2 * mt * t * c.y) + (t * t * b.y);

      const ll = map.unproject({ x, y });
      coords.push([ll.lng, ll.lat]);
    }

    // Midpoint (t=0.5)
    const t = 0.5, mt = 0.5;
    const midX = (mt * mt * a.x) + (2 * mt * t * c.x) + (t * t * b.x);
    const midY = (mt * mt * a.y) + (2 * mt * t * c.y) + (t * t * b.y);
    const midLL = map.unproject({ x: midX, y: midY });

    // Direction of travel based on A->B in screen space
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

    return { coords, midLL: [midLL.lng, midLL.lat], angleDeg };
  }

  async function loadSvgAsMapImage(map, id, svgUrl, pixelRatio = 2) {
    if (map.hasImage(id)) return;

    const svgText = await fetch(svgUrl, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${svgUrl}: ${r.status}`);
      return r.text();
    });

    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const objectUrl = URL.createObjectURL(blob);

    const img = new Image();
    img.decoding = 'async';
    img.src = objectUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    URL.revokeObjectURL(objectUrl);

    map.addImage(id, img, { pixelRatio });
  }

  window.addEventListener('travelMap:ready', async (e) => {
    const map = e.detail.map;

    const guatemalaCity = [-90.5069, 14.6349];     // secondary pin
    const antiguaGuatemala = [-90.7346, 14.5586];  // primary pin

    const R_PRIMARY = 15;   // 30px / 2
    const R_SECONDARY = 9;  // 18px / 2

    if (!map.getSource('routes')) {
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    // Load your car.svg as a MapLibre icon
    await loadSvgAsMapImage(map, 'car-icon', './icons/car.svg', 2);

    // Line layer
    if (!map.getLayer('drive-route-line')) {
      map.addLayer({
        id: 'drive-route-line',
        type: 'line',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'drive-line'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#2f9e6f',
          'line-width': 3,
          'line-opacity': 0.85
        }
      });
    }

    // Car icon at midpoint
    if (!map.getLayer('drive-route-car')) {
      map.addLayer({
        id: 'drive-route-car',
        type: 'symbol',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'drive-car'],
        layout: {
          'icon-image': 'car-icon',
          'icon-size': 0.55,              // adjust if needed; targets ~secondary pin size
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotate': ['get', 'angle']
        }
      });
    }

    function updateGuatemalaToAntigua() {
      const [startLL, endLL] = trimToCircleEdges(map, guatemalaCity, antiguaGuatemala, R_SECONDARY, R_PRIMARY);
      const { coords, midLL, angleDeg } = curvedLineScreenSpace(map, startLL, endLL, 0.18, 18, 55, 90);

      const lineFeature = {
        type: 'Feature',
        properties: { kind: 'drive-line' },
        geometry: { type: 'LineString', coordinates: coords }
      };

      const carFeature = {
        type: 'Feature',
        properties: { kind: 'drive-car', angle: angleDeg },
        geometry: { type: 'Point', coordinates: midLL }
      };

      map.getSource('routes').setData({
        type: 'FeatureCollection',
        features: [lineFeature, carFeature]
      });
    }

    updateGuatemalaToAntigua();
    map.once('idle', updateGuatemalaToAntigua);
    map.on('move', updateGuatemalaToAntigua);
    map.on('zoom', updateGuatemalaToAntigua);
    map.on('resize', updateGuatemalaToAntigua);
  });
})();

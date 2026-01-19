// routes.js
// Guatemala City -> Antigua Guatemala
// Curved line trimmed to pin circle edges + car icon at midpoint (hidden until zoom >= minzoom)

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

  // Curvature scales with segment length for consistent look across zoom.
  // Also returns midpoint on the curve (t=0.5) for the car.
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

    // Curve midpoint (t=0.5)
    const t = 0.5, mt = 0.5;
    const midX = (mt * mt * a.x) + (2 * mt * t * c.x) + (t * t * b.x);
    const midY = (mt * mt * a.y) + (2 * mt * t * c.y) + (t * t * b.y);
    const midLL = map.unproject({ x: midX, y: midY });

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
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.decoding = 'async';
    img.src = url;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    URL.revokeObjectURL(url);

    map.addImage(id, img, { pixelRatio });
  }

  window.addEventListener('travelMap:ready', async (e) => {
    const map = e.detail.map;

    const guatemalaCity = [-90.5069, 14.6349];     // secondary pin
    const antiguaGuatemala = [-90.7346, 14.5586];  // primary pin

    const R_PRIMARY = 15;   // 30px / 2
    const R_SECONDARY = 9;  // 18px / 2

    // Source
    if (!map.getSource('routes')) {
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    // Load car icon once
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

    // Car layer (hidden until zoom threshold)
    if (!map.getLayer('drive-route-car')) {
      map.addLayer({
        id: 'drive-route-car',
        type: 'symbol',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'drive-car'],
        minzoom: 8.0,
        layout: {
          'icon-image': 'car-icon',
          'icon-size': 3.5,                 // your current size
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotate': ['+', ['get', 'angle'], 180]
        }
      });
    }

    function updateRoute() {
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

      // IMPORTANT: always include the line feature
      map.getSource('routes').setData({
        type: 'FeatureCollection',
        features: [lineFeature, carFeature]
      });
    }

    updateRoute();
    map.once('idle', updateRoute);
    map.on('move', updateRoute);
    map.on('zoom', updateRoute);
    map.on('resize', updateRoute);
  });
})();

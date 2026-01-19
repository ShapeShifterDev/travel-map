// routes.js
// Two curved driving routes with identical styling/behavior:
// 1) Guatemala City -> Antigua Guatemala
// 2) Antigua Guatemala -> Lake Atitlan (Panajachel)
// Lines trimmed to pin edges + car icon near midpoint, offset slightly above the line.
// Car hidden until zoom threshold.

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

  // Curvature scales with on-screen segment length (clamped) for consistent look across zoom.
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

    return coords;
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

  async function loadMirroredSvgAsImageData(map, id, svgUrl, pixelRatio = 2) {
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

    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);

    map.addImage(id, { width: w, height: h, data: imgData.data }, { pixelRatio });
  }

  function buildRouteFeatures(map, routeId, fromLL, toLL, fromRadiusPx, toRadiusPx) {
    const [startLL, endLL] = trimToCircleEdges(map, fromLL, toLL, fromRadiusPx, toRadiusPx);
    const coords = curvedLineScreenSpace(map, startLL, endLL, 0.18, 18, 55, 90);

    // Midpoint index on sampled curve
    const midI = Math.floor(coords.length / 2);
    const mid = coords[midI];
    const prev = coords[Math.max(0, midI - 1)];
    const next = coords[Math.min(coords.length - 1, midI + 1)];

    // Local tangent for rotation and offset direction
    const pPrev = map.project({ lng: prev[0], lat: prev[1] });
    const pNext = map.project({ lng: next[0], lat: next[1] });
    const tdx = pNext.x - pPrev.x;
    const tdy = pNext.y - pPrev.y;
    const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;

    const angleDeg = Math.atan2(tdy, tdx) * 180 / Math.PI;

    // Offset slightly above the line (perpendicular in screen space)
    const nx = -tdy / tlen;
    const ny =  tdx / tlen;

    const offsetPx = 12; // same as finalized route
    const pMid = map.project({ lng: mid[0], lat: mid[1] });
    const pCar = { x: pMid.x + nx * offsetPx, y: pMid.y + ny * offsetPx };
    const carLL = map.unproject(pCar);

    const lineFeature = {
      type: 'Feature',
      properties: { kind: 'drive-line', routeId },
      geometry: { type: 'LineString', coordinates: coords }
    };

    const carFeature = {
      type: 'Feature',
      properties: { kind: 'drive-car', routeId, angle: angleDeg },
      geometry: { type: 'Point', coordinates: [carLL.lng, carLL.lat] }
    };

    return [lineFeature, carFeature];
  }

  window.addEventListener('travelMap:ready', async (e) => {
    const map = e.detail.map;

    // Pin coords must match pins.js
    const guatemalaCity = [-90.5069, 14.6349];     // secondary (small)
    const antiguaGuatemala = [-90.7346, 14.5586];  // primary (large)
    const panajachel = [-91.1580, 14.7409];        // primary (large)

    // Pin radii must match pins.js CSS sizes
    const R_PRIMARY = 15;   // 30px / 2
    const R_SECONDARY = 9;  // 18px / 2

    if (!map.getSource('routes')) {
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    // Keep base icon load optional; mirrored is used (same as final route)
    try { await loadSvgAsMapImage(map, 'car-icon', './icons/car.svg', 2); } catch (_) {}
    await loadMirroredSvgAsImageData(map, 'car-icon-mirror', './icons/car.svg', 2);

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

    // Car layer (same finalized params)
    if (!map.getLayer('drive-route-car')) {
      map.addLayer({
        id: 'drive-route-car',
        type: 'symbol',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'drive-car'],
        minzoom: 8.0,
        layout: {
          'icon-image': 'car-icon-mirror',
          'icon-size': 3.5,
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotate': ['+', ['get', 'angle'], 180]
        }
      });
    }

    function updateRoutes() {
      const features = [];

      // Route 1: Guatemala City -> Antigua (secondary -> primary)
      features.push(
        ...buildRouteFeatures(map, 'gt-city_to_antigua', guatemalaCity, antiguaGuatemala, R_SECONDARY, R_PRIMARY)
      );

      // Route 2: Antigua -> Panajachel (primary -> primary)
      features.push(
        ...buildRouteFeatures(map, 'antigua_to_panajachel', antiguaGuatemala, panajachel, R_PRIMARY, R_PRIMARY)
      );

      map.getSource('routes').setData({
        type: 'FeatureCollection',
        features
      });
    }

    updateRoutes();
    map.once('idle', updateRoutes);
    map.on('move', updateRoutes);
    map.on('zoom', updateRoutes);
    map.on('resize', updateRoutes);
  });
})();

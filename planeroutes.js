// planeroutes.js
// Flight routes only.
// - Gently curved path (screen-space bezier) for consistent look across zoom
// - Trimmed to start/end at center edge of pin circles
// - Dashed line styling
// - Plane icon at midpoint, rotated to direction of travel
// Current route: San Salvador -> PTY Airport (plane.svg)

(function () {
  function pinCenterScreenPoint(map, lngLat, radiusPx) {
    // Marker anchor is 'bottom' so lng/lat maps to bottom-center of circle.
    // Circle center is radiusPx above that point.
    const p = map.project({ lng: lngLat[0], lat: lngLat[1] });
    return { x: p.x, y: p.y - radiusPx };
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

  // Curvature scales with on-screen segment length (clamped) to avoid over-bending at low zoom.
  function curvedLineScreenSpace(map, startLL, endLL, curvatureFactor = 0.14, minPx = 14, maxPx = 45, segments = 90) {
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

  window.addEventListener('travelMap:ready', async (e) => {
    const map = e.detail.map;

    // Pin coordinates (must match pins.js)
    const sanSalvador = [-89.2182, 13.6929]; // primary
    const ptyAirport = [-79.3835, 9.0714];   // secondary

    // Pin radii (must match pins.js CSS)
    const R_PRIMARY = 15;   // 30px / 2
    const R_SECONDARY = 9;  // 18px / 2

    // Separate GeoJSON source for flights
    if (!map.getSource('planeRoutes')) {
      map.addSource('planeRoutes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    // Load plane icon
    await loadSvgAsMapImage(map, 'plane-icon', './icons/plane.svg', 2);

    // Dashed flight line layer
    if (!map.getLayer('flight-route-line')) {
      map.addLayer({
        id: 'flight-route-line',
        type: 'line',
        source: 'planeRoutes',
        filter: ['==', ['get', 'kind'], 'flight-line'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2f9e6f',         // same family as drive routes
          'line-width': 2.5,
          'line-opacity': 0.75,
          'line-dasharray': [2, 2]
        }
      });
    }

    // Plane icon layer
    if (!map.getLayer('flight-route-plane')) {
      map.addLayer({
        id: 'flight-route-plane',
        type: 'symbol',
        source: 'planeRoutes',
        filter: ['==', ['get', 'kind'], 'flight-plane'],
        layout: {
          'icon-image': 'plane-icon',
          'icon-size': 2.2,
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotate': ['get', 'angle']
        }
      });
    }

    function updateFlightRoutes() {
      const [startLL, endLL] = trimToCircleEdges(map, sanSalvador, ptyAirport, R_PRIMARY, R_SECONDARY);
      const coords = curvedLineScreenSpace(map, startLL, endLL, 0.14, 14, 45, 90);

      // Midpoint & local tangent for icon rotation
      const midI = Math.floor(coords.length / 2);
      const mid = coords[midI];
      const prev = coords[Math.max(0, midI - 1)];
      const next = coords[Math.min(coords.length - 1, midI + 1)];

      const pPrev = map.project({ lng: prev[0], lat: prev[1] });
      const pNext = map.project({ lng: next[0], lat: next[1] });

      const dx = pNext.x - pPrev.x;
      const dy = pNext.y - pPrev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;

      const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

      // Offset plane above the line (perpendicular, screen space)
      const nx = -dy / len;
      const ny = dx / len;
      
      const offsetPx = 14; // slightly larger than car for visibility
      const pMid = map.project({ lng: mid[0], lat: mid[1] });
      const pPlane = { x: pMid.x + nx * offsetPx, y: pMid.y + ny * offsetPx };
      const planeLL = map.unproject(pPlane);

      const lineFeature = {
        type: 'Feature',
        properties: { kind: 'flight-line', routeId: 'sansalvador_to_pty' },
        geometry: { type: 'LineString', coordinates: coords }
      };

      const planeFeature = {
        type: 'Feature',
        properties: { kind: 'flight-plane', routeId: 'sansalvador_to_pty', angle: angleDeg },
        geometry: { type: 'Point', coordinates: [planeLL.lng, planeLL.lat] }
      };

      map.getSource('planeRoutes').setData({
        type: 'FeatureCollection',
        features: [lineFeature, planeFeature]
      });
    }

    updateFlightRoutes();
    map.once('idle', updateFlightRoutes);
    map.on('move', updateFlightRoutes);
    map.on('zoom', updateFlightRoutes);
    map.on('resize', updateFlightRoutes);
  });
})();

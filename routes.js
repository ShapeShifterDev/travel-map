// routes.js
// Responsible ONLY for route lines (no icons, no arrows yet).
// Currently draws ONE curved driving route: Guatemala City -> Antigua Guatemala,
// trimmed so it starts/ends at the edge-center of the pin circles.

(function () {
  function ensureRouteStyles(map) {
    // no CSS needed; routes are MapLibre layers
  }

  // Marker anchor is 'bottom' so the lng/lat is the bottom-center of the circle.
  // The circle center is radiusPx above that point (in screen pixels).
  function pinCenterScreenPoint(map, lngLat, radiusPx) {
    const p = map.project({ lng: lngLat[0], lat: lngLat[1] });
    return { x: p.x, y: p.y - radiusPx };
  }

  function trimToCircleEdges(map, aLngLat, bLngLat, aRadiusPx, bRadiusPx) {
    // Work in screen space using circle centers, then trim to circle edges.
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

  // Build a curve in screen space (so it visibly curves), then unproject to lng/lat points.
  function curvedLineScreenSpace(map, startLL, endLL, curvaturePx = 70, segments = 90) {
    const a = map.project({ lng: startLL[0], lat: startLL[1] });
    const b = map.project({ lng: endLL[0], lat: endLL[1] });

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;

    const px = -dy / len;
    const py = dx / len;

    // Control point offset perpendicular to the segment
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

  window.addEventListener('travelMap:ready', (e) => {
    const map = e.detail.map;
    ensureRouteStyles(map);

    // Pin centers (must match pins.js coordinates)
    const guatemalaCity = [-90.5069, 14.6349];     // secondary pin
    const antiguaGuatemala = [-90.7346, 14.5586];  // primary pin

    // Pin radii in px (match pins.js CSS sizes)
    const R_PRIMARY = 15;    // 30px / 2
    const R_SECONDARY = 9;   // 18px / 2

    // Create source if needed
    if (!map.getSource('routes')) {
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    // Add the line layer once
    if (!map.getLayer('drive-route-line')) {
      map.addLayer({
        id: 'drive-route-line',
        type: 'line',
        source: 'routes',
        paint: {
          'line-color': '#2f9e6f',
          'line-width': 3,
          'line-opacity': 0.85,
          'line-join': 'round',
          'line-cap': 'round'
        }
      });
    }

    function updateGuatemalaToAntigua() {
      // Trim endpoints to circle edges (edge-center)
      const [startLL, endLL] = trimToCircleEdges(map, guatemalaCity, antiguaGuatemala, R_SECONDARY, R_PRIMARY);

      // Smooth curved line
      const lineCoords = curvedLineScreenSpace(map, startLL, endLL, 70, 90);

      const feature = {
        type: 'Feature',
        properties: { mode: 'drive' },
        geometry: { type: 'LineString', coordinates: lineCoords }
      };

      map.getSource('routes').setData({
        type: 'FeatureCollection',
        features: [feature]
      });
    }

    // Initial draw + keep aligned as map moves/zooms
    updateGuatemalaToAntigua();
    map.once('idle', updateGuatemalaToAntigua);
    map.on('move', updateGuatemalaToAntigua);
    map.on('zoom', updateGuatemalaToAntigua);
    map.on('resize', updateGuatemalaToAntigua);
  });
})();

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
    const bocasDelToro = [-82.2479, 9.3406]; // primary
    const panamaCity = [-79.5199, 8.9824]; // Panama City

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

    // Load plane icons
    await loadSvgAsMapImage(map, 'plane-icon', './icons/plane.svg', 2);
    await loadSvgAsMapImage(map, 'smallplane-icon', './icons/smallplane.svg', 2);

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

    if (!map.getLayer('flight-route-smallplane')) {
      map.addLayer({
        id: 'flight-route-smallplane',
        type: 'symbol',
        source: 'planeRoutes',
        filter: ['==', ['get', 'kind'], 'flight-smallplane'],
        layout: {
          'icon-image': 'smallplane-icon',
          'icon-size': 0.10,
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-rotate': ['+', ['get', 'angle'], 180]
        }
      });
    }

    function updateFlightRoutes() {
  const flightFeatures = [];

  // --- Route 1: San Salvador -> PTY (big plane, icon sits on your chosen side) ---
  {
    const [startLL, endLL] = trimToCircleEdges(map, sanSalvador, ptyAirport, R_PRIMARY, R_SECONDARY);
    const coords = curvedLineScreenSpace(map, startLL, endLL, 0.14, 14, 45, 90);

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

    // Offset (your current setting)
    const nx = -dy / len;
    const ny = dx / len;

    const offsetPx = -14;
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

    flightFeatures.push(lineFeature, planeFeature);
  }

  // --- Route 2: PTY -> Bocas (small plane, icon sits BELOW the line) ---
  {
    const [startLL2, endLL2] = trimToCircleEdges(map, ptyAirport, bocasDelToro, R_SECONDARY, R_PRIMARY);
    const coords2 = curvedLineScreenSpace(map, startLL2, endLL2, 0.14, 14, 45, 90);

    const midI2 = Math.floor(coords2.length / 2);
    const mid2 = coords2[midI2];
    const prev2 = coords2[Math.max(0, midI2 - 1)];
    const next2 = coords2[Math.min(coords2.length - 1, midI2 + 1)];

    const pPrev2 = map.project({ lng: prev2[0], lat: prev2[1] });
    const pNext2 = map.project({ lng: next2[0], lat: next2[1] });

    const dx2 = pNext2.x - pPrev2.x;
    const dy2 = pNext2.y - pPrev2.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;

    const angleDeg2 = Math.atan2(dy2, dx2) * 180 / Math.PI;

    // Perpendicular unit vector
    const nx2 = -dy2 / len2;
    const ny2 = dx2 / len2;

    // BELOW the line for this route (opposite sign vs Route 1)
    const offsetPx2 = 14;

    const pMid2 = map.project({ lng: mid2[0], lat: mid2[1] });
    const pPlane2 = { x: pMid2.x + nx2 * offsetPx2, y: pMid2.y + ny2 * offsetPx2 };
    const planeLL2 = map.unproject(pPlane2);

    const lineFeature2 = {
      type: 'Feature',
      properties: { kind: 'flight-line', routeId: 'pty_to_bocas' },
      geometry: { type: 'LineString', coordinates: coords2 }
    };

    const smallPlaneFeature2 = {
      type: 'Feature',
      properties: { kind: 'flight-smallplane', routeId: 'pty_to_bocas', angle: angleDeg2 },
      geometry: { type: 'Point', coordinates: [planeLL2.lng, planeLL2.lat] }
    };

    flightFeatures.push(lineFeature2, smallPlaneFeature2);
  }

  // --- Route 3: Bocas Del Toro -> Panama City (small plane) ---
{
  const [startLL3, endLL3] = trimToCircleEdges(
    map,
    bocasDelToro,
    panamaCity,
    R_PRIMARY,
    R_PRIMARY
  );

  const coords3 = curvedLineScreenSpace(map, startLL3, endLL3, 0.14, 14, 45, 90);

  const midI3 = Math.floor(coords3.length / 2);
  const mid3 = coords3[midI3];
  const prev3 = coords3[Math.max(0, midI3 - 1)];
  const next3 = coords3[Math.min(coords3.length - 1, midI3 + 1)];

  const pPrev3 = map.project({ lng: prev3[0], lat: prev3[1] });
  const pNext3 = map.project({ lng: next3[0], lat: next3[1] });

  const dx3 = pNext3.x - pPrev3.x;
  const dy3 = pNext3.y - pPrev3.y;
  const len3 = Math.sqrt(dx3 * dx3 + dy3 * dy3) || 1;

  const angleDeg3 = Math.atan2(dy3, dx3) * 180 / Math.PI;

  // Perpendicular unit vector
  const nx3 = -dy3 / len3;
  const ny3 = dx3 / len3;

  // SAME side as other small-plane route (below the line)
  const offsetPx3 = 14;

  const pMid3 = map.project({ lng: mid3[0], lat: mid3[1] });
  const pPlane3 = { x: pMid3.x + nx3 * offsetPx3, y: pMid3.y + ny3 * offsetPx3 };
  const planeLL3 = map.unproject(pPlane3);

  const lineFeature3 = {
    type: 'Feature',
    properties: { kind: 'flight-line', routeId: 'bocas_to_panamacity' },
    geometry: { type: 'LineString', coordinates: coords3 }
  };

  const smallPlaneFeature3 = {
    type: 'Feature',
    properties: {
      kind: 'flight-smallplane',
      routeId: 'bocas_to_panamacity',
      angle: angleDeg3
    },
    geometry: { type: 'Point', coordinates: [planeLL3.lng, planeLL3.lat] }
  };

  flightFeatures.push(lineFeature3, smallPlaneFeature3);
}

  map.getSource('planeRoutes').setData({
    type: 'FeatureCollection',
    features: flightFeatures
  });
}

    updateFlightRoutes();
    map.once('idle', updateFlightRoutes);
    map.on('move', updateFlightRoutes);
    map.on('zoom', updateFlightRoutes);
    map.on('resize', updateFlightRoutes);
  });
})();

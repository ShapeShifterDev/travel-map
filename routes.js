// routes.js
// One curved driving route: Guatemala City -> Antigua Guatemala
// Trimmed to start/end at the edge-center of the pin circles.
// Shows ONE car icon centered along the curve (correctly oriented & larger).

(function () {
  function pinCenterScreenPoint(map, lngLat, radiusPx) {
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

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const midLL = map.unproject({ x: midX, y: midY });

    // Direction of travel
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;

    return { coords, midLL: [midLL.lng, midLL.lat], angleDeg };
  }

  async function loadSvgAsMapImage(map, id, svgUrl, pixelRatio = 2) {
    if (map.hasImage(id)) return;

    const svgText = await fetch(svgUrl, { cache: 'no-store' }).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${svgUrl}`);
      return r.text();
    });

    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.src = url;
    await new Promise(res => (img.onload = res));
    URL.revokeObjectURL(url);

    map.addImage(id, img, { pixelRatio });
  }

  window.addEventListener('travelMap:ready', async (e) => {
    const map = e.detail.map;

    const guatemalaCity = [-90.5069, 14.6349];
    const antiguaGuatemala = [-90.7346, 14.5586];

    const R_PRIMARY = 15;
    const R_SECONDARY = 9;

    if (!map.getSource('routes')) {
      map.addSource('routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }

    await loadSvgAsMapImage(map, 'car-icon', './icons/car.svg', 2);

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

    if (!map.getLayer('drive-route-car')) {
      map.addLayer({
        id: 'drive-route-car',
        type: 'symbol',
        source: 'routes',
        filter: ['==', ['get', 'kind'], 'drive-car'],
        layout: {
          'icon-image': 'car-icon',
          'icon-size': 1.5,
          'icon-rotation-alignment': 'map',
          'icon-keep-upright': false,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          // ⬇ rotation fix (90° offset – adjust if your SVG faces a different direction)
          'icon-rotate': ['+', ['get', 'angle'], -90]
        }
      });
    }

    function updateRoute() {
      const [startLL, endLL] = trimToCircleEdges(
        map,
        guatemalaCity,
        antiguaGuatemala,
        R_SECONDARY,
        R_PRIMARY
      );

      const { coords, midLL, angleDeg } =
        curvedLineScreenSpace(map, startLL, endLL);

      map.getSource('routes').setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { kind: 'drive-line' },
            geometry: { type: 'LineString', coordinates: coords }
          },
          {
            type: 'Feature',
            properties: {
              kind: 'drive-car',
              angle: angleDeg
            },
            geometry: { type: 'Point', coordinates: midLL }
          }
        ]
      });
    }

    updateRoute();
    map.on('move', updateRoute);
    map.on('zoom', updateRoute);
    map.on('resize', updateRoute);
  });
})();

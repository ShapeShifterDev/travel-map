// pins.js
// Responsible ONLY for city pins and their styling

(function () {
  function addCityPin(map, { lng, lat, city, nights, small = false, start = false }) {
    const el = document.createElement('div');
    el.className = small ? 'pin small' : 'pin';
    if (start) el.classList.add('start');

    if (!small && typeof nights === 'number') {
      el.textContent = String(nights);
    }

    let tooltipHtml = `<div style="font-weight:700;">${city}</div>`;
    if (!small && typeof nights === 'number') {
      tooltipHtml += `<div style="font-size:12px;">${nights} Night${nights === 1 ? '' : 's'}</div>`;
    }

    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 16
    }).setHTML(tooltipHtml);

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'bottom'
    })
      .setLngLat([lng, lat])
      .addTo(map);

    el.addEventListener('mouseenter', () => popup.setLngLat([lng, lat]).addTo(map));
    el.addEventListener('mouseleave', () => popup.remove());

    return marker;
  }

  // Wait for the base map to be ready
  window.addEventListener('travelMap:ready', (e) => {
    const map = e.detail.map;

    // --- Guatemala ---
    addCityPin({
      lng: -90.5069,
      lat: 14.6349,
      city: 'Guatemala City',
      small: true,
      start: true
    });

    addCityPin({
      lng: -90.7346,
      lat: 14.5586,
      city: 'Antigua Guatemala',
      nights: 2
    });

    addCityPin({
      lng: -91.1580,
      lat: 14.7409,
      city: 'Lake Atitlán',
      nights: 2
    });

    // --- El Salvador ---
    addCityPin({
      lng: -89.7360,
      lat: 13.7770,
      city: 'Nahuizalco',
      small: true
    });

    addCityPin({
      lng: -89.7450,
      lat: 13.8410,
      city: 'Juayúa',
      nights: 1
    });

    addCityPin({
      lng: -89.3850,
      lat: 13.4920,
      city: 'El Tunco',
      nights: 2
    });

    addCityPin({
      lng: -89.2182,
      lat: 13.6929,
      city: 'San Salvador',
      nights: 1
    });

    // --- Panama ---
    addCityPin({
      lng: -79.5199,
      lat: 8.9824,
      city: 'Panama City',
      nights: 3
    });

    addCityPin({
      lng: -82.2479,
      lat: 9.3406,
      city: 'Bocas del Toro',
      nights: 2
    });

    addCityPin({
      lng: -79.3835,
      lat: 9.0714,
      city: 'PTY Airport',
      small: true
    });
  });
})();

// pins.js
// Responsible ONLY for city pins and their styling (injects required CSS)

(function () {
  function ensurePinStyles() {
    if (document.getElementById('pin-styles')) return;

    const style = document.createElement('style');
    style.id = 'pin-styles';
    style.textContent = `
      .pin-wrap{
        position: relative;
        width: 0;
        height: 0;
      }

      .pin{
        position: absolute;
        left: 0;
        bottom: 0;
        transform: translateX(-50%);

        width: 30px;
        height: 30px;
        border-radius: 999px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 14px;
        user-select: none;
        cursor: pointer;

        background-color: rgba(159, 216, 181, 0.55);
        color: #1f4d3a;

        border: 2px solid rgba(255, 255, 255, 0.95);
        box-shadow: 0 2px 6px rgba(0,0,0,0.18);
      }

      .pin.small{
        width: 18px;
        height: 18px;
        font-size: 12px;
        font-weight: 700;
      }

      .pin.start{
        border-color: #2f9e6f;
      }

      .pin-label{
        position: absolute;
        left: 0;
        bottom: -26px;
        transform: translateX(-50%);
        font-size: 12px;
        font-weight: 700;
        color: #1f4d3a;
        background: rgba(255,255,255,0.85);
        padding: 2px 6px;
        border-radius: 999px;
        line-height: 1;
        white-space: nowrap;
        box-shadow: 0 1px 4px rgba(0,0,0,0.12);
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  function addCityPin(map, { lng, lat, city, nights, small = false, start = false, label }) {
    const wrap = document.createElement('div');
    wrap.className = 'pin-wrap';

    const el = document.createElement('div');
    el.className = small ? 'pin small' : 'pin';
    if (start) el.classList.add('start');

    if (!small && typeof nights === 'number') {
      el.textContent = String(nights);
    } else {
      el.textContent = '';
    }

    wrap.appendChild(el);

    if (typeof label === 'string' && label.trim()) {
      const lab = document.createElement('div');
      lab.className = 'pin-label';
      lab.textContent = label.trim();
      wrap.appendChild(lab);
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

    new maplibregl.Marker({ element: wrap, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map);

    el.addEventListener('mouseenter', () => popup.setLngLat([lng, lat]).addTo(map));
    el.addEventListener('mouseleave', () => popup.remove());
  }

  window.addEventListener('travelMap:ready', (e) => {
    const map = e.detail.map;

    ensurePinStyles();

    // --- Guatemala ---
    addCityPin(map, { lng: -90.5069, lat: 14.6349, city: 'Guatemala City', small: true, start: true, label: 'Start' });
    addCityPin(map, { lng: -90.7346, lat: 14.5586, city: 'Antigua Guatemala', nights: 2 });
    addCityPin(map, { lng: -91.1580, lat: 14.7409, city: 'Lake Atitlán', nights: 2 });

    // --- El Salvador ---
    addCityPin(map, { lng: -89.7360, lat: 13.7770, city: 'Nahuizalco', small: true });
    addCityPin(map, { lng: -89.7450, lat: 13.8410, city: 'Juayúa', nights: 1 });
    addCityPin(map, { lng: -89.3850, lat: 13.4920, city: 'El Tunco', nights: 2 });
    addCityPin(map, { lng: -89.2182, lat: 13.6929, city: 'San Salvador', nights: 1 });

    // --- Panama ---
    addCityPin(map, { lng: -79.5199, lat: 8.9824, city: 'Panama City', nights: 3, label: 'End' });
    addCityPin(map, { lng: -82.2479, lat: 9.3406, city: 'Bocas del Toro', nights: 2 });
    addCityPin(map, { lng: -79.3835, lat: 9.0714, city: 'PTY Airport', small: true });
  });
})();

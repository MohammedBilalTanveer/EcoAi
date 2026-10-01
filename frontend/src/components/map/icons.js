import L from 'leaflet';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Classic teardrop pin. */
export function pinIcon(color = '#9b6ff1', { glyph = '', size = 34 } = {}) {
  const html = `
    <svg width="${size}" height="${size * 1.25}" viewBox="0 0 32 40" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,.5))">
      <path d="M16 39s13-13.3 13-23A13 13 0 0 0 3 16c0 9.7 13 23 13 23z" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
      <circle cx="16" cy="16" r="6.5" fill="#050414" opacity=".85"/>
      ${glyph ? `<text x="16" y="19.5" text-anchor="middle" font-size="9">${esc(glyph)}</text>` : ''}
    </svg>`;
  return L.divIcon({ html, className: 'map-pin', iconSize: [size, size * 1.25], iconAnchor: [size / 2, size * 1.2], popupAnchor: [0, -size] });
}

/** Small circular marker (used for report severities and route stops). */
export function dotIcon(color, { size = 14, ring = 'rgba(5,4,20,.9)' } = {}) {
  const html = `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid ${ring};box-shadow:0 0 0 1px ${color}66,0 2px 6px rgba(0,0,0,.5)"></span>`;
  return L.divIcon({ html, className: 'map-pin', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

/** Pulsing "you are here" dot. */
export function userIcon() {
  const html = `
    <span style="position:relative;display:block;width:18px;height:18px">
      <span style="position:absolute;inset:-10px;border-radius:9999px;background:rgba(56,189,248,.25);animation:ping 2s cubic-bezier(0,0,.2,1) infinite"></span>
      <span style="position:absolute;inset:0;border-radius:9999px;background:#38bdf8;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5)"></span>
    </span>
    <style>@keyframes ping{75%,100%{transform:scale(1.8);opacity:0}}</style>`;
  return L.divIcon({ html, className: 'map-pin', iconSize: [18, 18], iconAnchor: [9, 9] });
}

/** Garbage truck marker with a heading arrow. */
export function truckIcon(color, heading = 0, selected = false) {
  const size = selected ? 46 : 38;
  const html = `
    <div style="position:relative;width:${size}px;height:${size}px">
      <div class="truck-heading" style="position:absolute;inset:0;transform:rotate(${heading}deg);transition:transform .6s ease">
        <span style="position:absolute;left:50%;top:-7px;transform:translateX(-50%);width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${color}"></span>
      </div>
      <div style="position:absolute;inset:0;display:grid;place-items:center;border-radius:9999px;background:#0b0a1f;border:3px solid ${color};box-shadow:0 0 0 ${selected ? 6 : 0}px ${color}33,0 6px 16px rgba(0,0,0,.55);font-size:${selected ? 20 : 17}px">🚛</div>
    </div>`;
  return L.divIcon({ html, className: 'map-pin truck-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

/** Price tag marker for food listings. */
export function priceIcon(label, { color = '#9b6ff1', active = false } = {}) {
  const html = `
    <div style="transform:translate(-50%,-100%);display:inline-flex;flex-direction:column;align-items:center">
      <span style="white-space:nowrap;padding:4px 9px;border-radius:9999px;font:700 12px 'Plus Jakarta Sans',sans-serif;background:${active ? '#fff' : '#0b0a1f'};color:${active ? '#050414' : '#fff'};border:2px solid ${color};box-shadow:0 6px 14px rgba(0,0,0,.5)">${esc(label)}</span>
      <span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:7px solid ${color};margin-top:-1px"></span>
    </div>`;
  return L.divIcon({ html, className: 'map-pin', iconSize: [0, 0], iconAnchor: [0, 0] });
}

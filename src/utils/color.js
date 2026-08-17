// src/utils/color.js
export function lum(hex) {
  try {
    const h = (hex || '').replace('#', '');
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    return .299 * r + .587 * g + .114 * b;
  } catch (e) {
    return 200;
  }
}

export const txtOn = hex => lum(hex) > 150 ? '#1B2430' : '#FFFFFF';

export function tint(hex, a) {
  try {
    const h = (hex || '#888').replace('#', '');
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    return `rgba(${r},${g},${b},${a})`;
  } catch (e) {
    return `rgba(120,120,120,${a})`;
  }
}

export function shade(hex) {
  try {
    const h = (hex || '').replace('#', '');
    const f = parseInt(h.substr(0, 2), 16);
    const s = parseInt(h.substr(2, 2), 16);
    const t = parseInt(h.substr(4, 2), 16);
    const d = v => Math.max(0, Math.round(v * .55));
    return `rgb(${d(f)},${d(s)},${d(t)})`;
  } catch (e) {
    return '#333';
  }
}

export const colorOf = x => (x && x.color) || '#8A94A6';

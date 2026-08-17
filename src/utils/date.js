// src/utils/date.js
const pad = n => String(n).padStart(2, '0');

export const nowIso = () => new Date().toISOString();

export const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
};

export const toISO = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export const addDays = (iso, n) => {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const diffDays = (a, b) =>
  Math.round((new Date(b) - new Date(a)) / 864e5) + 1;

export const fmtD = iso => iso
  ? new Date(iso.length > 10 ? iso : iso + 'T00:00:00').toLocaleDateString('ru-RU')
  : '—';

export const fmtDT = iso => iso ? new Date(iso).toLocaleString('ru-RU') : '—';

export const stamp = () => {
  const d = new Date();
  return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
};

export const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

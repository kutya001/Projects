// src/ui/toast.js
import { $, esc } from '../utils/dom.js';

export function toast(msg, kind, duration = 3200) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.innerHTML = esc(msg);
  const container = $('#toasts');
  if (container) container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = '.4s';
    setTimeout(() => t.remove(), 400);
  }, duration);
}

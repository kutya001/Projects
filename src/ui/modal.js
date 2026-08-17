// src/ui/modal.js
import { $, esc } from '../utils/dom.js';

export function modal({ title, sub, body, foot, wide, mount }) {
  const root = $('#modalRoot');
  const ovl = document.createElement('div');
  ovl.className = 'ovl';
  ovl.innerHTML = `<div class="mdl ${wide ? 'wide' : ''}">
    <div class="mdl-h"><div><div class="mono" style="color:var(--acc);font-size:10px;letter-spacing:.2em;margin-bottom:3px">${esc(sub || '')}</div><h2>${title}</h2></div>
    <button class="ibtn x" title="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 5l14 14M19 5L5 19"/></svg></button></div>
    <div class="mdl-b">${body}</div>${foot ? `<div class="mdl-f">${foot}</div>` : ''}</div>`;
  root.appendChild(ovl);

  const close = () => ovl.remove();
  ovl.querySelector('.x').onclick = close;
  ovl.addEventListener('mousedown', e => { if (e.target === ovl) close(); });

  const onKey = e => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKey);
    }
  };
  document.addEventListener('keydown', onKey);

  if (mount) mount({ el: ovl, close });
  return { close, el: ovl };
}

export function confirmBox(msg, onYes) {
  modal({
    title: 'Подтверждение',
    body: `<p style="font-size:14px;line-height:1.55">${esc(msg)}</p>`,
    foot: `<button class="btn" data-x>Отмена</button><button class="btn dgr" data-ok>Удалить</button>`,
    mount(box) {
      box.el.querySelector('[data-x]').onclick = () => box.close();
      box.el.querySelector('[data-ok]').onclick = () => { box.close(); onYes(); };
    }
  });
}

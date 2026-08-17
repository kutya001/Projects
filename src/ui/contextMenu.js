// src/ui/contextMenu.js
import { esc } from '../utils/dom.js';

let activeMenu = null;

export function showContextMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  closeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';

  menu.innerHTML = items.map(item => {
    if (item.type === 'divider') return `<div class="ctx-div"></div>`;
    return `<button class="ctx-item ${item.danger ? 'danger' : ''}" data-act="${item.id}">
      <span class="ctx-icon">${item.icon || ''}</span>
      <span class="ctx-label">${esc(item.label)}</span>
    </button>`;
  }).join('');

  document.body.appendChild(menu);

  // Calculate coordinates to keep within screen bounds
  const rect = menu.getBoundingClientRect();
  const menuWidth = rect.width || 200;
  const menuHeight = rect.height || 160;

  let x = e.clientX;
  let y = e.clientY;

  if (x + menuWidth > window.innerWidth - 10) {
    x = window.innerWidth - menuWidth - 10;
  }
  if (y + menuHeight > window.innerHeight - 10) {
    y = window.innerHeight - menuHeight - 10;
  }

  menu.style.left = `${Math.max(10, x)}px`;
  menu.style.top = `${Math.max(10, y)}px`;

  activeMenu = menu;

  const onClick = (evt) => {
    const btn = evt.target.closest('.ctx-item');
    if (btn) {
      const actId = btn.dataset.act;
      const targetItem = items.find(i => i.id === actId);
      if (targetItem && targetItem.action) {
        targetItem.action();
      }
    }
    closeContextMenu();
  };

  const onKey = (evt) => {
    if (evt.key === 'Escape') closeContextMenu();
  };

  setTimeout(() => {
    window.addEventListener('click', onClick, { capture: true, once: true });
    window.addEventListener('contextmenu', onClick, { capture: true, once: true });
    window.addEventListener('keydown', onKey, { capture: true, once: true });
  }, 10);
}

export function closeContextMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

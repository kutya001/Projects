// src/utils/colorSelect.js
import { esc } from './dom.js';
import { colorOf } from './color.js';

/**
 * Generates <option> list HTML with color dots prepended for selects
 */
export function renderColorOptions(items = [], selectedId = null, placeholder = '') {
  let html = '';
  if (placeholder) {
    html += `<option value="" data-color="">${placeholder}</option>`;
  }
  for (const item of items) {
    if (!item) continue;
    const c = colorOf(item);
    const sel = (selectedId !== null && selectedId !== undefined && String(item.id) === String(selectedId)) ? 'selected' : '';
    html += `<option value="${item.id}" ${sel} data-color="${c}" style="color:${c}">● ${esc(item.name)}</option>`;
  }
  return html;
}

/**
 * Enriches all select controls in container with a dynamic round color dot indicator
 */
export function setupColorSelects(container) {
  if (!container) return;
  const selects = container.querySelectorAll('select');

  selects.forEach(select => {
    const hasColorOpts = Array.from(select.options).some(opt => opt.dataset && opt.dataset.color);
    if (!hasColorOpts) return;

    // Check if already wrapped
    let wrapper = select.closest('.sel-color-wrap');
    let dot = wrapper ? wrapper.querySelector('.sel-color-dot') : null;

    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'sel-color-wrap';
      wrapper.style.position = 'relative';
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.width = select.style.width || '100%';
      if (select.classList.contains('flex-1') || select.style.flex === '1') {
        wrapper.style.flex = '1';
      }

      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);

      dot = document.createElement('span');
      dot.className = 'sel-color-dot';
      dot.style.position = 'absolute';
      dot.style.left = '10px';
      dot.style.width = '10px';
      dot.style.height = '10px';
      dot.style.borderRadius = '50%';
      dot.style.pointerEvents = 'none';
      dot.style.zIndex = '2';
      dot.style.transition = 'background-color .15s ease';
      wrapper.appendChild(dot);
    }

    const updateDot = () => {
      const selectedOpt = select.options[select.selectedIndex];
      const col = selectedOpt ? (selectedOpt.dataset.color || '') : '';
      if (col && col !== 'transparent') {
        dot.style.backgroundColor = col;
        dot.style.display = 'block';
        select.style.paddingLeft = '28px';
      } else {
        dot.style.display = 'none';
        select.style.paddingLeft = '10px';
      }
    };

    updateDot();
    select.addEventListener('change', updateDot);
  });
}

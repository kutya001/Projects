// src/services/formLayout.js
import { db, refreshAll } from '../core/db.js';
import { toast } from '../ui/toast.js';
import { modal } from '../ui/modal.js';
import { esc } from '../utils/dom.js';

/**
 * Valid grid column spans (out of 12)
 * 3 cols = 25%
 * 4 cols = 33%
 * 6 cols = 50%
 * 8 cols = 66%
 * 9 cols = 75%
 * 12 cols = 100%
 */
const SNAP_SPANS = [
  { span: 3, pct: 25, label: '1/4 (25%)' },
  { span: 4, pct: 33, label: '1/3 (33%)' },
  { span: 6, pct: 50, label: '1/2 (50%)' },
  { span: 8, pct: 66, label: '2/3 (66%)' },
  { span: 9, pct: 75, label: '3/4 (75%)' },
  { span: 12, pct: 100, label: 'Вся строка (100%)' }
];

export function spanToPct(span) {
  if (span <= 3) return 25;
  if (span === 4) return 33;
  if (span <= 6) return 50;
  if (span <= 8) return 66;
  if (span <= 9) return 75;
  return 100;
}

export function pctToSpan(pct) {
  if (pct <= 25) return 3;
  if (pct <= 35) return 4;
  if (pct <= 55) return 6;
  if (pct <= 70) return 8;
  if (pct <= 80) return 9;
  return 12;
}

/**
 * Get layout for a form by key
 */
export function getFormLayout(S, formKey, defaultFields = []) {
  const layouts = S.formLayouts || [];
  const found = layouts.find(l => l.formKey === formKey);
  
  if (found && found.layout && typeof found.layout === 'object' && found.layout.fields) {
    const savedMap = new Map();
    found.layout.fields.forEach(f => savedMap.set(f.id, f));

    const result = [];
    found.layout.fields.forEach(f => {
      const def = defaultFields.find(d => d.id === f.id);
      if (def) {
        result.push({
          id: f.id,
          label: def.label || f.label || f.id,
          width: f.width !== undefined ? f.width : (def.width || 100),
          order: f.order !== undefined ? f.order : def.order,
          visible: f.visible !== undefined ? f.visible : (def.visible !== false),
          height: f.height !== undefined ? f.height : def.height
        });
      }
    });

    defaultFields.forEach(def => {
      if (!savedMap.has(def.id)) {
        result.push({
          id: def.id,
          label: def.label || def.id,
          width: def.width || 100,
          order: def.order !== undefined ? def.order : result.length,
          visible: def.visible !== false,
          height: def.height
        });
      }
    });

    result.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return result;
  }

  return defaultFields.map((f, idx) => ({
    id: f.id,
    label: f.label || f.id,
    width: f.width || (f.id === 'name' || f.id === 'desc' || f.id === 'stageed' ? 100 : 50),
    order: f.order !== undefined ? f.order : idx,
    visible: f.visible !== false,
    height: f.height
  }));
}

/**
 * Apply layout attributes to form elements container
 */
export function applyFormLayout(containerEl, layoutFields) {
  if (!containerEl || !layoutFields) return;

  const isGrid = containerEl.classList.contains('fgrid') || window.getComputedStyle(containerEl).display === 'grid';

  layoutFields.forEach(f => {
    const el = containerEl.querySelector(`[data-field="${f.id}"]`);
    if (el) {
      el.style.order = f.order !== undefined ? f.order : 0;
      el.style.display = f.visible === false ? 'none' : '';
      
      const widthPct = f.width || 100;
      const span = pctToSpan(widthPct);

      if (span === 12) {
        el.style.setProperty('grid-column', '1 / -1', 'important');
        el.style.setProperty('width', '100%', 'important');
        el.style.setProperty('max-width', '100%', 'important');
      } else {
        el.style.setProperty('grid-column', `span ${span}`, 'important');
        el.style.setProperty('width', '100%', 'important');
        el.style.setProperty('max-width', '100%', 'important');
      }

      if (f.height) {
        const inp = el.querySelector('textarea, input, .stageed, .mcheck, .dl, .v-section-title + div');
        if (inp) inp.style.minHeight = `${f.height}px`;
      }
    }
  });
}

/**
 * Save form layout to server database
 */
export async function saveFormLayout(S, formKey, fields) {
  const existing = (S.formLayouts || []).find(l => l.formKey === formKey);
  const data = {
    formKey,
    layout: { fields },
    updatedAt: new Date().toISOString()
  };

  try {
    if (existing && existing.id) {
      data.id = existing.id;
      await db.formLayouts.put(data);
    } else {
      const newId = await db.formLayouts.add(data);
      data.id = newId;
    }
    await refreshAll(S);
    toast('Расположение и размеры полей сохранены в SQLite', 'ok');
    return true;
  } catch (err) {
    toast('Ошибка сохранения макета: ' + err.message, 'err');
    return false;
  }
}

/**
 * Interactive In-Place Form Designer
 * Enables live drag-and-drop reordering and horizontal/vertical edge resizing directly on the form
 */
export function enableInteractiveFormDesigner(S, formKey, formEl, defaultFields, onLayoutChanged) {
  let fields = JSON.parse(JSON.stringify(getFormLayout(S, formKey, defaultFields)));
  let isDesignerActive = false;

  // Find or create Designer Toolbar
  let toolbar = formEl.parentElement ? formEl.parentElement.querySelector('.form-designer-toolbar') : null;
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'form-designer-toolbar';
    toolbar.style.display = 'none';
    formEl.parentNode.insertBefore(toolbar, formEl);
  }

  const updateToolbarHtml = () => {
    const hiddenFields = fields.filter(f => f.visible === false);
    toolbar.innerHTML = `
      <div class="fdt-inner" style="display:flex;align-items:center;gap:10px;justify-content:space-between;background:#2A4365;color:#fff;padding:8px 14px;border-radius:8px;margin-bottom:12px;box-shadow:var(--sh)">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:15px">🎨</span>
          <div>
            <div style="font-weight:700;font-size:13px;line-height:1.2">Интерактивный конструктор формы</div>
            <div style="font-size:11px;opacity:0.85">Перетаскивайте за плашку для смены порядка. Тяните за правый край для изменения ширины.</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          ${hiddenFields.length ? `
            <select class="fdt-add-hidden" style="font-size:11.5px;padding:4px 8px;border-radius:6px;background:#fff;color:#1A202C;border:none">
              <option value="">+ Показать скрытое поле (${hiddenFields.length})</option>
              ${hiddenFields.map(hf => `<option value="${hf.id}">${esc(hf.label)}</option>`).join('')}
            </select>
          ` : ''}
          <button type="button" class="btn sm fdt-reset" style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.3);font-size:11px;padding:4px 8px">Сбросить</button>
          <button type="button" class="btn sm pri fdt-done" style="font-size:11.5px;font-weight:700;padding:4px 10px;background:#38A169;border-color:#2F855A">✅ Готово</button>
        </div>
      </div>
    `;

    const addHiddenSel = toolbar.querySelector('.fdt-add-hidden');
    if (addHiddenSel) {
      addHiddenSel.onchange = async () => {
        const fieldId = addHiddenSel.value;
        if (!fieldId) return;
        const f = fields.find(x => x.id === fieldId);
        if (f) {
          f.visible = true;
          applyCurrentLayout();
          await saveFormLayout(S, formKey, fields);
          updateToolbarHtml();
        }
      };
    }

    const btnReset = toolbar.querySelector('.fdt-reset');
    if (btnReset) {
      btnReset.onclick = async () => {
        fields = defaultFields.map((f, idx) => ({
          id: f.id,
          label: f.label || f.id,
          width: f.width || (f.id === 'name' || f.id === 'desc' || f.id === 'stageed' ? 100 : 50),
          order: idx,
          visible: true,
          height: f.height || null
        }));
        applyCurrentLayout();
        await saveFormLayout(S, formKey, fields);
        updateToolbarHtml();
        toast('Макет сброшен по умолчанию', 'ok');
      };
    }

    const btnDone = toolbar.querySelector('.fdt-done');
    if (btnDone) {
      btnDone.onclick = () => {
        toggleDesigner(false);
      };
    }
  };

  const applyCurrentLayout = () => {
    applyFormLayout(formEl, fields);
    if (onLayoutChanged) onLayoutChanged(fields);
  };

  // Drag & Drop and Resizer Injection for each field element
  const setupFieldDecorations = () => {
    const fieldEls = formEl.querySelectorAll('[data-field]');

    fieldEls.forEach(el => {
      const fieldId = el.dataset.field;
      let fData = fields.find(f => f.id === fieldId);
      if (!fData) {
        const def = defaultFields.find(d => d.id === fieldId) || { id: fieldId, label: fieldId, width: 50 };
        fData = { id: fieldId, label: def.label, width: def.width, order: fields.length, visible: true };
        fields.push(fData);
      }

      // Check if wrapper bar already exists
      let handleBar = el.querySelector('.fd-handle-bar');
      if (!handleBar) {
        handleBar = document.createElement('div');
        handleBar.className = 'fd-handle-bar';
        handleBar.innerHTML = `
          <div class="fd-drag-grab" title="Зажмите и перетащите для смены порядка">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
            <span class="fd-field-title">${esc(fData.label)}</span>
          </div>
          <div class="fd-size-badges">
            <button type="button" class="fd-badge ${fData.width === 25 ? 'on' : ''}" data-w="25" title="Ширина 25%">1/4</button>
            <button type="button" class="fd-badge ${fData.width === 33 ? 'on' : ''}" data-w="33" title="Ширина 33%">1/3</button>
            <button type="button" class="fd-badge ${fData.width === 50 ? 'on' : ''}" data-w="50" title="Ширина 50%">1/2</button>
            <button type="button" class="fd-badge ${fData.width === 66 ? 'on' : ''}" data-w="66" title="Ширина 66%">2/3</button>
            <button type="button" class="fd-badge ${fData.width === 75 ? 'on' : ''}" data-w="75" title="Ширина 75%">3/4</button>
            <button type="button" class="fd-badge ${fData.width === 100 ? 'on' : ''}" data-w="100" title="Ширина 100%">100%</button>
          </div>
          <button type="button" class="fd-btn-hide" title="Скрыть это поле">✕</button>
        `;
        el.insertBefore(handleBar, el.firstChild);

        // Size badge clicks
        handleBar.querySelectorAll('.fd-badge').forEach(badge => {
          badge.onclick = async (e) => {
            e.stopPropagation();
            const w = +badge.dataset.w;
            fData.width = w;
            handleBar.querySelectorAll('.fd-badge').forEach(b => b.classList.toggle('on', +b.dataset.w === w));
            applyCurrentLayout();
            await saveFormLayout(S, formKey, fields);
          };
        });

        // Hide button click
        handleBar.querySelector('.fd-btn-hide').onclick = async (e) => {
          e.stopPropagation();
          fData.visible = false;
          applyCurrentLayout();
          await saveFormLayout(S, formKey, fields);
          updateToolbarHtml();
        };
      }

      // Horizontal edge resizer (Right edge)
      let resizerR = el.querySelector('.fd-resizer-r');
      if (!resizerR) {
        resizerR = document.createElement('div');
        resizerR.className = 'fd-resizer-r';
        resizerR.title = 'Потяните для изменения ширины';
        el.appendChild(resizerR);

        resizerR.addEventListener('mousedown', initHorizontalResize);
        resizerR.addEventListener('touchstart', initHorizontalResize, { passive: false });
      }

      // Vertical height resizer for textareas/inputs/sections
      let resizerB = el.querySelector('.fd-resizer-b');
      if (!resizerB && (el.querySelector('textarea') || el.querySelector('.stageed') || el.querySelector('.mcheck') || el.querySelector('.dl') || el.dataset.field === 'desc' || el.dataset.field === 'note' || el.dataset.field === 'details')) {
        resizerB = document.createElement('div');
        resizerB.className = 'fd-resizer-b';
        resizerB.title = 'Потяните для изменения высоты';
        el.appendChild(resizerB);

        resizerB.addEventListener('mousedown', initVerticalResize);
        resizerB.addEventListener('touchstart', initVerticalResize, { passive: false });
      }

      // Make element draggable for reordering
      el.setAttribute('draggable', 'true');

      el.ondragstart = (e) => {
        if (!isDesignerActive) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('text/field-id', fieldId);
        el.classList.add('fd-dragging');
      };

      el.ondragend = () => {
        el.classList.remove('fd-dragging');
        formEl.querySelectorAll('[data-field]').forEach(f => f.classList.remove('fd-drag-over'));
      };

      el.ondragover = (e) => {
        if (!isDesignerActive) return;
        e.preventDefault();
        el.classList.add('fd-drag-over');
      };

      el.ondragleave = () => {
        el.classList.remove('fd-drag-over');
      };

      el.ondrop = async (e) => {
        if (!isDesignerActive) return;
        e.preventDefault();
        el.classList.remove('fd-drag-over');
        const draggedId = e.dataTransfer.getData('text/field-id');
        if (!draggedId || draggedId === fieldId) return;

        const fromIdx = fields.findIndex(f => f.id === draggedId);
        const toIdx = fields.findIndex(f => f.id === fieldId);

        if (fromIdx !== -1 && toIdx !== -1) {
          const item = fields.splice(fromIdx, 1)[0];
          fields.splice(toIdx, 0, item);
          fields.forEach((f, i) => f.order = i);
          applyCurrentLayout();
          await saveFormLayout(S, formKey, fields);
        }
      };

      function initHorizontalResize(e) {
        if (!isDesignerActive) return;
        e.preventDefault();
        e.stopPropagation();

        const isTouch = e.type === 'touchstart';
        const startX = isTouch ? e.touches[0].clientX : e.clientX;
        const gridRect = formEl.getBoundingClientRect();
        const startWidth = el.getBoundingClientRect().width;
        const totalGridWidth = gridRect.width || 700;

        let curPct = fData.width || 50;

        const onMove = (moveEvt) => {
          const clientX = isTouch ? moveEvt.touches[0].clientX : moveEvt.clientX;
          const deltaX = clientX - startX;
          const newPx = Math.max(120, Math.min(totalGridWidth, startWidth + deltaX));
          const rawPct = (newPx / totalGridWidth) * 100;

          // Snap to closest column span
          let closest = SNAP_SPANS[0];
          let minDiff = 999;
          SNAP_SPANS.forEach(s => {
            const diff = Math.abs(s.pct - rawPct);
            if (diff < minDiff) {
              minDiff = diff;
              closest = s;
            }
          });

          curPct = closest.pct;
          fData.width = curPct;
          
          const span = pctToSpan(curPct);
          if (span === 12) {
            el.style.gridColumn = '1 / -1';
          } else {
            el.style.gridColumn = `span ${span}`;
          }

          // Update badges
          handleBar.querySelectorAll('.fd-badge').forEach(b => {
            b.classList.toggle('on', +b.dataset.w === curPct);
          });
        };

        const onEnd = async () => {
          document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
          document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd);
          applyCurrentLayout();
          await saveFormLayout(S, formKey, fields);
        };

        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd);
      }

      function initVerticalResize(e) {
        if (!isDesignerActive) return;
        e.preventDefault();
        e.stopPropagation();

        const isTouch = e.type === 'touchstart';
        const startY = isTouch ? e.touches[0].clientY : e.clientY;
        const targetInput = el.querySelector('textarea, input, .stageed, .mcheck, .dl') || el;
        const startHeight = targetInput.getBoundingClientRect().height;

        const onMove = (moveEvt) => {
          const clientY = isTouch ? moveEvt.touches[0].clientY : moveEvt.clientY;
          const deltaY = clientY - startY;
          const newH = Math.max(45, Math.min(600, startHeight + deltaY));
          fData.height = Math.round(newH);
          targetInput.style.minHeight = `${fData.height}px`;
        };

        const onEnd = async () => {
          document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', onMove);
          document.removeEventListener(isTouch ? 'touchend' : 'mouseup', onEnd);
          await saveFormLayout(S, formKey, fields);
        };

        document.addEventListener(isTouch ? 'touchmove' : 'mousemove', onMove, { passive: false });
        document.addEventListener(isTouch ? 'touchend' : 'mouseup', onEnd);
      }
    });
  };

  const toggleDesigner = (forceState) => {
    isDesignerActive = forceState !== undefined ? forceState : !isDesignerActive;
    formEl.classList.toggle('form-designer-active', isDesignerActive);
    toolbar.style.display = isDesignerActive ? 'block' : 'none';

    if (isDesignerActive) {
      updateToolbarHtml();
      setupFieldDecorations();
    }
  };

  // Initial layout application
  applyCurrentLayout();

  return {
    toggle: toggleDesigner,
    apply: applyCurrentLayout,
    getFields: () => fields
  };
}

/**
 * Open Modal to customize fields order, width, visibility and height (Dialog mode)
 */
export function openFormLayoutCustomizer(S, formKey, formTitle, defaultFields, onLayoutUpdated) {
  let fields = JSON.parse(JSON.stringify(getFormLayout(S, formKey, defaultFields)));

  const renderFieldRows = () => {
    return fields.map((f, idx) => `
      <div class="layout-field-row" data-idx="${idx}" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#F9FAF6;border:1px solid var(--line2);border-radius:8px;margin-bottom:6px">
        <div style="display:flex;gap:3px;flex-direction:column">
          <button type="button" class="ibtn sm btn-move-up" data-idx="${idx}" ${idx === 0 ? 'disabled style="opacity:0.3"' : ''} title="Вверх" style="width:20px;height:20px;padding:0">▲</button>
          <button type="button" class="ibtn sm btn-move-down" data-idx="${idx}" ${idx === fields.length - 1 ? 'disabled style="opacity:0.3"' : ''} title="Вниз" style="width:20px;height:20px;padding:0">▼</button>
        </div>
        
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;width:180px;font-weight:600;font-size:13px" title="Включить / скрыть поле">
          <input type="checkbox" class="chk-field-vis" data-idx="${idx}" ${f.visible !== false ? 'checked' : ''}>
          <span>${esc(f.label)}</span>
        </label>

        <div style="display:flex;align-items:center;gap:6px;flex:1">
          <span style="font-size:11.5px;color:var(--mut);font-weight:600">Ширина:</span>
          <select class="sel-field-width" data-idx="${idx}" style="font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--line);background:#fff">
            <option value="25" ${f.width === 25 ? 'selected' : ''}>1/4 (25%)</option>
            <option value="33" ${f.width === 33 ? 'selected' : ''}>1/3 (33%)</option>
            <option value="50" ${f.width === 50 ? 'selected' : ''}>1/2 (50%)</option>
            <option value="66" ${f.width === 66 ? 'selected' : ''}>2/3 (66%)</option>
            <option value="75" ${f.width === 75 ? 'selected' : ''}>3/4 (75%)</option>
            <option value="100" ${f.width === 100 ? 'selected' : ''}>Вся строка (100%)</option>
          </select>
        </div>

        ${(f.id === 'desc' || f.id === 'note' || f.id === 'details' || f.id === 'stageed' || f.id === 'mcheck') ? `
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11.5px;color:var(--mut);font-weight:600">Высота:</span>
          <input type="number" class="inp-field-height" data-idx="${idx}" value="${f.height || ''}" placeholder="авто" min="40" max="600" step="10" style="width:65px;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid var(--line)">
          <span style="font-size:11px;color:var(--mut)">px</span>
        </div>` : ''}
      </div>
    `).join('');
  };

  const body = `
    <div style="font-size:12.5px;color:var(--mut);margin-bottom:12px;line-height:1.5">
      Настройте порядок отображения, ширину и видимость элементов формы. Изменения сохраняются в SQLite и применяются ко всем пользователям.
    </div>
    <div id="layoutFieldsList" style="max-height:460px;overflow-y:auto;padding-right:4px">
      ${renderFieldRows()}
    </div>
    <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
      <button type="button" class="btn sm" id="btnResetLayout" style="color:var(--mut)">Сбросить по умолчанию</button>
      <span style="font-size:11.5px;color:var(--mut)">Полей в форме: <b>${fields.length}</b></span>
    </div>
  `;

  modal({
    title: `⚙️ Настройка полей формы`,
    sub: formTitle ? formTitle.toUpperCase() : 'КОНСТРУКТОР ФОРМЫ',
    wide: false,
    body,
    foot: `<button class="btn" data-x>Отмена</button><button class="btn pri" id="btnSaveFormLayout">Сохранить макет</button>`,
    mount(box) {
      const listEl = box.el.querySelector('#layoutFieldsList');

      const reRenderList = () => {
        listEl.innerHTML = renderFieldRows();
        bindListeners();
      };

      const bindListeners = () => {
        listEl.querySelectorAll('.btn-move-up').forEach(btn => {
          btn.onclick = () => {
            const idx = +btn.dataset.idx;
            if (idx > 0) {
              const temp = fields[idx];
              fields[idx] = fields[idx - 1];
              fields[idx - 1] = temp;
              fields.forEach((f, i) => f.order = i);
              reRenderList();
            }
          };
        });

        listEl.querySelectorAll('.btn-move-down').forEach(btn => {
          btn.onclick = () => {
            const idx = +btn.dataset.idx;
            if (idx < fields.length - 1) {
              const temp = fields[idx];
              fields[idx] = fields[idx + 1];
              fields[idx + 1] = temp;
              fields.forEach((f, i) => f.order = i);
              reRenderList();
            }
          };
        });

        listEl.querySelectorAll('.chk-field-vis').forEach(chk => {
          chk.onchange = () => {
            const idx = +chk.dataset.idx;
            fields[idx].visible = chk.checked;
          };
        });

        listEl.querySelectorAll('.sel-field-width').forEach(sel => {
          sel.onchange = () => {
            const idx = +sel.dataset.idx;
            fields[idx].width = +sel.value;
          };
        });

        listEl.querySelectorAll('.inp-field-height').forEach(inp => {
          inp.oninput = () => {
            const idx = +inp.dataset.idx;
            fields[idx].height = inp.value ? +inp.value : null;
          };
        });
      };

      bindListeners();

      box.el.querySelector('#btnResetLayout').onclick = () => {
        fields = defaultFields.map((f, idx) => ({
          id: f.id,
          label: f.label || f.id,
          width: f.width || (f.id === 'name' || f.id === 'desc' || f.id === 'stageed' ? 100 : 50),
          order: idx,
          visible: true,
          height: f.height || null
        }));
        reRenderList();
        toast('Настройки сброшены к значениям по умолчанию', 'ok');
      };

      box.el.querySelector('[data-x]').onclick = () => box.close();

      box.el.querySelector('#btnSaveFormLayout').onclick = async () => {
        fields.forEach((f, i) => f.order = i);
        const ok = await saveFormLayout(S, formKey, fields);
        if (ok) {
          box.close();
          if (onLayoutUpdated) onLayoutUpdated(fields);
        }
      };
    }
  });
}

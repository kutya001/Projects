// src/components/table/filters.js
import { esc } from '../../utils/dom.js';
import { colorOf } from '../../utils/color.js';
import { popover, closePop } from '../../ui/popover.js';
import { savePrefs } from '../../core/prefs.js';
import { colVal, dirItem } from './renderers.js';

export function matchSearch(S, coldefs, ent, r) {
  if (!S.search) return true;
  const q = S.search.toLowerCase();
  return coldefs[ent].some(c => String(colVal(S, ent, r, c.k) ?? '').toLowerCase().includes(q));
}

export function applyFilters(S, coldefs, ent, rows, st) {
  return rows.filter(r => {
    for (const k in st.filters) {
      const f = st.filters[k];
      const cdef = coldefs[ent].find(c => c.k === k);
      if (!cdef || !f) continue;

      if (f.type === 'sel') {
        const raw = r[k];
        if (cdef.type === 'active') {
          const actStr = (r.active !== false && r.active !== 0) ? '1' : '0';
          if (!f.sel.map(String).includes(actStr)) return false;
        } else if (cdef.type === 'role') {
          if (!f.sel.includes(r.role)) return false;
        } else if (Array.isArray(raw)) {
          if (!raw.some(v => f.sel.includes(v) || f.sel.includes(String(v)) || (!isNaN(+v) && f.sel.includes(+v)))) return false;
        } else {
          if (!f.sel.includes(raw ?? null) && !f.sel.includes(String(raw ?? '')) && (isNaN(+raw) || !f.sel.includes(+raw))) return false;
        }
      } else if (f.type === 'numRange') {
        const v = colVal(S, ent, r, k);
        const num = typeof v === 'number' ? v : (parseFloat(String(v).replace(',', '.')) || 0);
        if (f.min !== undefined && f.min !== '' && num < Number(f.min)) return false;
        if (f.max !== undefined && f.max !== '' && num > Number(f.max)) return false;
      } else if (f.type === 'date') {
        const v = (r[k] || '').slice(0, 10);
        if (!v) return false;
        if (f.from && v < f.from) return false;
        if (f.to && v > f.to) return false;
      } else if (f.type === 'txt') {
        if (!String(colVal(S, ent, r, k) ?? '').toLowerCase().includes(f.q.toLowerCase())) return false;
      }
    }
    return true;
  });
}

export function sortRows(S, coldefs, ent, rows, st) {
  if (!st.sort || !st.sort.k) return rows;
  const cdef = coldefs[ent].find(c => c.k === st.sort.k);
  const dir = st.sort.d || 1;

  return [...rows].sort((a, b) => {
    let va, vb;
    if (cdef && cdef.type === 'select') {
      va = (dirItem(cdef, a[st.sort.k]) || {}).name || '';
      vb = (dirItem(cdef, b[st.sort.k]) || {}).name || '';
    } else {
      va = colVal(S, ent, a, st.sort.k);
      vb = colVal(S, ent, b, st.sort.k);
    }
    if (va == null || va === '') return 1;
    if (vb == null || vb === '') return -1;

    const isNumCol = cdef && (cdef.type === 'date' || cdef.type === 'datetime' || cdef.type === 'number' || cdef.type === 'percent' || cdef.k === 'progress' || cdef.type === 'checklist');
    if (isNumCol) {
      if (cdef.type === 'date' || cdef.type === 'datetime') {
        return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
      }
      const numA = typeof va === 'number' ? va : (parseFloat(String(va).replace(',', '.')) || 0);
      const numB = typeof vb === 'number' ? vb : (parseFloat(String(vb).replace(',', '.')) || 0);
      return (numA > numB ? 1 : numA < numB ? -1 : 0) * dir;
    }
    return String(va).localeCompare(String(vb), 'ru', { numeric: true, sensitivity: 'base' }) * dir;
  });
}

export function openColFilter(S, coldefs, ent, st, k, anchor, onRender) {
  const cdef = coldefs[ent].find(c => c.k === k);
  const cur = st.filters[k];
  let html = '';

  const currentRows = S[ent] || [];

  if (cdef.type === 'select' || cdef.type === 'multi' || cdef.type === 'role' || cdef.type === 'active') {
    let allOpts = [];
    if (cdef.type === 'role') {
      allOpts = [
        { id: 'dev', name: 'Разработчик' },
        { id: 'agent', name: 'Агент / ПМ / Аналитик' }
      ];
    } else if (cdef.type === 'active') {
      allOpts = [
        { id: '1', name: 'Активен' },
        { id: '0', name: 'Архив / Неактивен' }
      ];
    } else if (cdef.dir) {
      allOpts = cdef.dir() || [];
    } else if (cdef.type === 'multi') {
      allOpts = (S.employees || []).filter(e => e.role === cdef.role && e.active !== false && e.active !== 0);
    }

    // Collect values that actually exist in current table rows
    const usedValues = new Set();
    currentRows.forEach(r => {
      if (cdef.type === 'active') {
        const actStr = (r.active !== false && r.active !== 0) ? '1' : '0';
        usedValues.add(actStr);
      } else if (cdef.type === 'role') {
        if (r.role) usedValues.add(String(r.role));
      } else {
        const raw = r[k];
        if (Array.isArray(raw)) {
          raw.forEach(v => { if (v != null) usedValues.add(String(v)); });
        } else if (raw != null && raw !== '') {
          usedValues.add(String(raw));
        }
      }
    });

    // Filter to only options present in current rows and sort alphabetically
    const opts = allOpts
      .filter(o => usedValues.has(String(o.id)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru', { numeric: true, sensitivity: 'base' }));

    const sel = cur && cur.type === 'sel' ? cur.sel : [];
    html = `<div class="pt">Фильтр: ${esc(cdef.label)}</div>
      <div style="max-height:260px;overflow:auto;min-width:210px">
      ${opts.map(o => `<label class="pi"><input type="checkbox" value="${o.id}" ${sel.includes(o.id) || sel.includes(String(o.id)) || (!isNaN(+o.id) && sel.includes(+o.id)) ? 'checked' : ''}>${o.color ? `<span class="dot" style="background:${colorOf(o)}"></span>` : ''}${esc(o.name)}</label>`).join('') || '<div style="color:var(--mut2);font-size:12px;padding:8px 0">Нет значений в таблице</div>'}
      </div>
      <div class="pact"><button class="btn sm" data-ap>Применить</button><button class="btn sm" data-rs>Сбросить</button></div>`;
  } else if (cdef.type === 'percent' || cdef.type === 'number' || cdef.k === 'progress') {
    const isPct = cdef.type === 'percent' || cdef.k === 'progress';
    html = `<div class="pt">Фильтр: ${esc(cdef.label)}</div>
      <div style="display:flex;gap:6px;align-items:center;margin:10px 0">
        <input type="number" id="fnumMin" placeholder="От ${isPct ? '%' : ''}" value="${cur?.min ?? ''}" style="width:85px;padding:6px 8px;font-family:'JetBrains Mono',monospace;font-size:12.5px" ${isPct ? 'min="0" max="100"' : ''}>
        <span style="color:var(--mut)">—</span>
        <input type="number" id="fnumMax" placeholder="До ${isPct ? '%' : ''}" value="${cur?.max ?? ''}" style="width:85px;padding:6px 8px;font-family:'JetBrains Mono',monospace;font-size:12.5px" ${isPct ? 'min="0" max="100"' : ''}>
      </div>
      <div class="pact"><button class="btn sm" data-ap>Применить</button><button class="btn sm" data-rs>Сбросить</button></div>`;
  } else if (cdef.type === 'logAction') {
    const usedActions = new Set(currentRows.map(r => r.action).filter(Boolean));
    const actionList = [
      { id: 'connect', name: '🟢 Вход / Подключение' },
      { id: 'disconnect', name: '⚪ Выход / Отключение' },
      { id: 'create', name: '➕ Создание записи' },
      { id: 'update', name: '✏️ Изменение записи' },
      { id: 'delete', name: '🗑️ Удаление записи' },
      { id: 'bulk_insert', name: '📦 Пакетная вставка' },
      { id: 'clear_table', name: '🧹 Очистка таблицы' },
      { id: 'sql_execute', name: '⚡ Выполнение SQL' }
    ].filter(o => usedActions.has(o.id))
     .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' }));

    const sel = cur && cur.type === 'sel' ? cur.sel : [];
    html = `<div class="pt">Фильтр: ${esc(cdef.label)}</div>
      <div style="max-height:260px;overflow:auto;min-width:220px">
      ${actionList.map(o => `<label class="pi"><input type="checkbox" value="${o.id}" ${sel.includes(o.id) ? 'checked' : ''}>${esc(o.name)}</label>`).join('') || '<div style="color:var(--mut2);font-size:12px;padding:8px 0">Нет записей</div>'}
      </div>
      <div class="pact"><button class="btn sm" data-ap>Применить</button><button class="btn sm" data-rs>Сбросить</button></div>`;
  } else if (cdef.type === 'logEntity') {
    const usedEntities = new Set(currentRows.map(r => r.entity).filter(Boolean));
    const entList = [
      { id: 'system', name: 'Система' },
      { id: 'projects', name: 'Проекты' },
      { id: 'tasks', name: 'Задачи' },
      { id: 'changes', name: 'Изменения' },
      { id: 'employees', name: 'Сотрудники' },
      { id: 'customers', name: 'Заказчики' },
      { id: 'priorities', name: 'Приоритеты' },
      { id: 'stages', name: 'Этапы' },
      { id: 'taskStatuses', name: 'Статусы задач' },
      { id: 'projectStatuses', name: 'Статусы проектов' },
      { id: 'kanbanBoards', name: 'Канбан доски' },
      { id: 'formLayouts', name: 'Макеты форм' },
      { id: 'db', name: 'База данных' }
    ].filter(o => usedEntities.has(o.id))
     .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true, sensitivity: 'base' }));

    const sel = cur && cur.type === 'sel' ? cur.sel : [];
    html = `<div class="pt">Фильтр: ${esc(cdef.label)}</div>
      <div style="max-height:260px;overflow:auto;min-width:200px">
      ${entList.map(o => `<label class="pi"><input type="checkbox" value="${o.id}" ${sel.includes(o.id) ? 'checked' : ''}>${esc(o.name)}</label>`).join('') || '<div style="color:var(--mut2);font-size:12px;padding:8px 0">Нет записей</div>'}
      </div>
      <div class="pact"><button class="btn sm" data-ap>Применить</button><button class="btn sm" data-rs>Сбросить</button></div>`;
  } else if (cdef.type === 'date' || cdef.type === 'datetime') {
    html = `<div class="pt">Фильтр по дате: ${esc(cdef.label)}</div>
      <label class="fl">С</label><input type="date" id="ffrom" value="${cur?.from || ''}">
      <label class="fl" style="margin-top:8px">По</label><input type="date" id="fto" value="${cur?.to || ''}">
      <div class="pact"><button class="btn sm" data-ap>Применить</button><button class="btn sm" data-rs>Сбросить</button></div>`;
  } else {
    html = `<div class="pt">Фильтр: ${esc(cdef.label)}</div>
      <input type="text" id="ftxt" placeholder="содержит…" value="${esc(cur?.q || '')}">
      <div class="pact"><button class="btn sm" data-ap>Применить</button><button class="btn sm" data-rs>Сбросить</button></div>`;
  }

  popover(anchor, html, async p => {
    p.querySelector('[data-rs]').onclick = async () => {
      delete st.filters[k];
      await savePrefs(S);
      closePop();
      if (onRender) onRender();
    };

    const apply = async () => {
      if (cdef.type === 'select' || cdef.type === 'multi' || cdef.type === 'logAction' || cdef.type === 'logEntity' || cdef.type === 'role' || cdef.type === 'active') {
        const sel = [...p.querySelectorAll('input:checked')].map(i => {
          if (cdef.type === 'logAction' || cdef.type === 'logEntity' || cdef.type === 'role' || cdef.type === 'active') {
            return i.value;
          }
          return !isNaN(+i.value) ? +i.value : i.value;
        });
        if (sel.length) st.filters[k] = { type: 'sel', sel };
        else delete st.filters[k];
      } else if (cdef.type === 'percent' || cdef.type === 'number' || cdef.k === 'progress') {
        const min = p.querySelector('#fnumMin').value.trim();
        const max = p.querySelector('#fnumMax').value.trim();
        if (min !== '' || max !== '') st.filters[k] = { type: 'numRange', min, max };
        else delete st.filters[k];
      } else if (cdef.type === 'date' || cdef.type === 'datetime') {
        const from = p.querySelector('#ffrom').value, to = p.querySelector('#fto').value;
        if (from || to) st.filters[k] = { type: 'date', from, to };
        else delete st.filters[k];
      } else {
        const q = p.querySelector('#ftxt').value.trim();
        if (q) st.filters[k] = { type: 'txt', q };
        else delete st.filters[k];
      }
      await savePrefs(S);
      closePop();
      if (onRender) onRender();
    };

    p.querySelector('[data-ap]').onclick = apply;
    const tx = p.querySelector('#ftxt') || p.querySelector('#fnumMin') || p.querySelector('#fnumMax');
    if (tx) tx.onkeydown = e => { if (e.key === 'Enter') apply(); };
  });
}

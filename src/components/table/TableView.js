// src/components/table/TableView.js
import { esc } from '../../utils/dom.js';
import { tblState, savePrefs } from '../../core/prefs.js';
import { EXP, ROWCAP } from '../../core/state.js';
import { getColDefs, DEFAULT_HIDDEN } from './colDefs.js';
import { cellHtml, chipHtml } from './renderers.js';
import { matchSearch, applyFilters, sortRows, openColFilter } from './filters.js';
import { subRowHtml } from './subRows.js';
import { popover } from '../../ui/popover.js';
import { showContextMenu } from '../../ui/contextMenu.js';
import { toast } from '../../ui/toast.js';
import { modal, confirmBox } from '../../ui/modal.js';
import { db, refreshAll } from '../../core/db.js';
import { nowIso } from '../../utils/date.js';
import { afterChange } from '../../utils/logger.js';
import { getCommonContextMenuItems } from '../../services/quickActions.js';
import { openMergeModal } from '../../services/entityMergeSplit.js';
import { renderColorOptions } from '../../utils/colorSelect.js';
import { statFor, pri, emp, prj, tsk, stg } from '../../services/refs.js';
import { colorOf } from '../../utils/color.js';

const FUNNEL = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';
const ROWCAP_ALL = {};

// Active selection state per entity table
const SELECTED_ROWS = {
  projects: new Set(),
  tasks: new Set(),
  changes: new Set(),
  employees: new Set(),
  customers: new Set(),
  priorities: new Set(),
  taskStatuses: new Set(),
  projectStatuses: new Set(),
  stages: new Set(),
  stageHistory: new Set(),
  auditLogs: new Set()
};

// Collapsed groups tracking per entity
const COLLAPSED_GROUPS = {};

// Preserved scroll position per entity table
const TBL_SCROLL_POS = {};

export function renderTableView(S, ent, mount, callbacks = {}) {
  SELECTED_ROWS[ent] = SELECTED_ROWS[ent] || new Set();
  COLLAPSED_GROUPS[ent] = COLLAPSED_GROUPS[ent] || new Set();
  const selected = SELECTED_ROWS[ent];

  const prevWrap = mount.querySelector('.tbl-wrap');
  const prevScrollTop = prevWrap ? prevWrap.scrollTop : (TBL_SCROLL_POS[ent]?.top || 0);
  const prevScrollLeft = prevWrap ? prevWrap.scrollLeft : (TBL_SCROLL_POS[ent]?.left || 0);
  const prevWindowY = window.scrollY;

  const coldefs = getColDefs(S);
  const tid = ent;
  const allKeys = (coldefs[ent] || []).map(c => c.k);
  const st = tblState(S, tid, allKeys);
  st.widths = st.widths || {};
  st.groupBy = st.groupBy || [];

  if (!st.hidden.length && !st.order.length && DEFAULT_HIDDEN[ent]) {
    st.hidden = [...DEFAULT_HIDDEN[ent]];
  }
  const visKeys = st.order.filter(k => !st.hidden.includes(k));

  let rows = (S[ent] || []).filter(r => matchSearch(S, coldefs, ent, r));
  rows = applyFilters(S, coldefs, ent, rows, st);
  rows = sortRows(S, coldefs, ent, rows, st);

  const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };
  const canExp = (ent === 'projects' && mods.tasks) || (ent === 'tasks' && mods.changes);
  const isMainEnt = ['projects', 'tasks', 'changes'].includes(ent);

  const head = visKeys.map(k => {
    const c = coldefs[ent].find(c => c.k === k) || { label: k };
    const f = st.filters[k];
    const arrow = st.sort && st.sort.k === k ? (st.sort.d > 0 ? '<span class="sarr">▲</span>' : '<span class="sarr">▼</span>') : '';
    const w = st.widths[k] || c.w;
    const wStyle = w ? `width:${w}px;min-width:${w}px` : '';

    return `<th class="th" data-k="${k}" draggable="true" style="${wStyle}">
      <div class="thc">
        <span class="lbl">${esc(c.label)}</span>${arrow}
        <button class="fbtn ${f ? 'on' : ''}" data-f="${k}" title="Фильтр">${FUNNEL}</button>
      </div>
      <div class="col-resizer" data-k="${k}"></div>
    </th>`;
  }).join('');

  const isCapAll = ROWCAP_ALL[ent];
  const limited = !isCapAll && rows.length > ROWCAP;
  const shown = limited ? rows.slice(0, ROWCAP) : rows;
  const allShownSelected = shown.length > 0 && shown.every(r => selected.has(r.id));
  const totalCols = 1 + (canExp ? 1 : 0) + visKeys.length + 1;

  // Group Value Resolver
  function getGroupValueInfo(colKey, record) {
    const rawVal = record[colKey];
    if (rawVal === undefined || rawVal === null || rawVal === '') {
      return { key: '__empty__', label: '(Не указано)', html: '<span style="color:var(--mut2);font-style:italic">— (Не указано) —</span>' };
    }

    if (colKey === 'statusId') {
      const stObj = statFor(S, ent, rawVal);
      if (stObj) return { key: String(rawVal), label: stObj.name, html: chipHtml(stObj.name, colorOf(stObj)) };
      return { key: String(rawVal), label: 'Статус ' + rawVal, html: 'Статус ' + rawVal };
    }
    if (colKey === 'priorityId') {
      const p = pri(S, rawVal);
      if (p) return { key: String(rawVal), label: p.name, html: chipHtml(p.name, colorOf(p)) };
      return { key: String(rawVal), label: 'Приоритет ' + rawVal, html: 'Приоритет ' + rawVal };
    }
    if (colKey === 'customerId') {
      const c = (S.customers || []).find(x => x.id === rawVal);
      if (c) return { key: String(rawVal), label: c.name, html: `<b>${esc(c.name)}</b>` };
      return { key: String(rawVal), label: 'Заказчик ' + rawVal, html: 'Заказчик ' + rawVal };
    }
    if (colKey === 'devId') {
      const d = emp(S, rawVal);
      if (d) return { key: String(rawVal), label: d.name, html: chipHtml(d.name, colorOf(d)) };
      return { key: String(rawVal), label: 'Разработчик ' + rawVal, html: 'Разработчик ' + rawVal };
    }
    if (colKey === 'agentId') {
      const a = emp(S, rawVal);
      if (a) return { key: String(rawVal), label: a.name, html: chipHtml(a.name, colorOf(a)) };
      return { key: String(rawVal), label: 'Агент ' + rawVal, html: 'Агент ' + rawVal };
    }
    if (colKey === 'projectId') {
      const pj = prj(S, rawVal);
      if (pj) return { key: String(rawVal), label: pj.name, html: `<b>${esc(pj.name)}</b> <span class="mono" style="color:var(--mut);font-size:11px">(${esc(pj.num || '')})</span>` };
      return { key: String(rawVal), label: 'Проект ' + rawVal, html: 'Проект ' + rawVal };
    }
    if (colKey === 'taskId') {
      const tk = tsk(S, rawVal);
      if (tk) return { key: String(rawVal), label: tk.name, html: `<b>${esc(tk.name)}</b> <span class="mono" style="color:var(--mut);font-size:11px">(${esc(tk.num || '')})</span>` };
      return { key: String(rawVal), label: 'Задача ' + rawVal, html: 'Задача ' + rawVal };
    }
    if (colKey === 'stageId') {
      const sObj = (S.stages || []).find(x => x.id === rawVal);
      if (sObj) return { key: String(rawVal), label: sObj.name, html: chipHtml(sObj.name, colorOf(sObj)) };
      return { key: String(rawVal), label: 'Этап ' + rawVal, html: 'Этап ' + rawVal };
    }
    if (colKey === 'active') {
      const isAct = rawVal === 1 || rawVal === true || rawVal === '1';
      return { key: String(isAct), label: isAct ? 'Активен' : 'Неактивен', html: `<span class="chip" style="background:${isAct ? '#E6FFFA' : '#FED7D7'};color:${isAct ? '#234E52' : '#9B2C2C'};font-weight:700">${isAct ? 'Активен' : 'Неактивен'}</span>` };
    }

    return { key: String(rawVal), label: String(rawVal), html: `<span>${esc(String(rawVal))}</span>` };
  }

  // Helper to render one row
  function renderSingleRow(r) {
    const isChecked = selected.has(r.id);
    const expBtn = canExp ? `<button class="exp ${EXP[ent].has(r.id) ? 'open' : ''}" data-exp="${r.id}">▶</button>` : '';
    const cells = visKeys.map(k => {
      const cdef = coldefs[ent].find(c => c.k === k) || { k };
      const w = st.widths[k] || cdef.w;
      const wStyle = w ? `width:${w}px;max-width:${w}px` : '';
      return `<td style="${wStyle}">${cellHtml(S, ent, cdef, r)}</td>`;
    }).join('');
    let extra = '';
    if (canExp && EXP[ent].has(r.id)) extra = subRowHtml(S, coldefs, ent, r);

    return `<tr class="rw ${isChecked ? 'row-selected' : ''}" data-id="${r.id}" style="${isChecked ? 'background:#EBF8FA !important' : ''}">
      <td class="tbl-select-col"><input type="checkbox" class="tbl-select-chk" data-sel-id="${r.id}" ${isChecked ? 'checked' : ''}></td>
      ${canExp ? `<td>${expBtn}</td>` : ''}
      ${cells}
      <td style="white-space:nowrap;width:${ent === 'auditLogs' ? '60px' : '88px'};text-align:right">
        <button class="ibtn" data-act="view" title="Просмотр деталей"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button>
        ${ent !== 'auditLogs' ? `<button class="ibtn" data-act="edit" title="Редактировать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>` : ''}
        <button class="ibtn" data-act="del" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button>
      </td>
    </tr>${extra}`;
  }

  // Build Body with or without Grouping
  let body = '';
  const groupBy = (st.groupBy || []).filter(k => (coldefs[ent] || []).some(c => c.k === k));
  const hasGrouping = groupBy.length > 0;

  if (!hasGrouping) {
    body = shown.map(renderSingleRow).join('');
  } else {
    const k1 = groupBy[0];
    const k2 = groupBy[1] || null;
    const col1Def = coldefs[ent].find(c => c.k === k1) || { label: k1 };
    const col2Def = k2 ? (coldefs[ent].find(c => c.k === k2) || { label: k2 }) : null;

    // Grouping structure
    const lvl1Map = new Map();
    shown.forEach(r => {
      const v1 = getGroupValueInfo(k1, r);
      if (!lvl1Map.has(v1.key)) {
        lvl1Map.set(v1.key, {
          valInfo: v1,
          items: [],
          lvl2Map: new Map()
        });
      }
      const g1 = lvl1Map.get(v1.key);
      g1.items.push(r);

      if (k2) {
        const v2 = getGroupValueInfo(k2, r);
        if (!g1.lvl2Map.has(v2.key)) {
          g1.lvl2Map.set(v2.key, {
            valInfo: v2,
            items: []
          });
        }
        g1.lvl2Map.get(v2.key).items.push(r);
      }
    });

    const bodyParts = [];
    lvl1Map.forEach((g1, key1) => {
      const g1Id = `g1_${key1}`;
      const isCol1 = COLLAPSED_GROUPS[ent].has(g1Id);

      bodyParts.push(`
        <tr class="tbl-group-hdr level-1" data-grp-id="${g1Id}">
          <td colspan="${totalCols}">
            <div class="tbl-group-hdr-inner">
              <span class="tbl-grp-arrow">${isCol1 ? '▶' : '▼'}</span>
              <span class="tbl-grp-field">${esc(col1Def.label)}:</span>
              <span class="tbl-grp-val">${g1.valInfo.html}</span>
              <span class="tbl-grp-badge">Количество: <b>${g1.items.length}</b></span>
            </div>
          </td>
        </tr>
      `);

      if (!isCol1) {
        if (k2) {
          g1.lvl2Map.forEach((g2, key2) => {
            const g2Id = `${g1Id}_g2_${key2}`;
            const isCol2 = COLLAPSED_GROUPS[ent].has(g2Id);

            bodyParts.push(`
              <tr class="tbl-group-hdr level-2" data-grp-id="${g2Id}">
                <td colspan="${totalCols}">
                  <div class="tbl-group-hdr-inner" style="padding-left:28px">
                    <span class="tbl-grp-arrow">${isCol2 ? '▶' : '▼'}</span>
                    <span class="tbl-grp-field">${esc(col2Def.label)}:</span>
                    <span class="tbl-grp-val">${g2.valInfo.html}</span>
                    <span class="tbl-grp-badge">Количество: <b>${g2.items.length}</b></span>
                  </div>
                </td>
              </tr>
            `);

            if (!isCol2) {
              g2.items.forEach(r => {
                bodyParts.push(renderSingleRow(r));
              });
            }
          });
        } else {
          g1.items.forEach(r => {
            bodyParts.push(renderSingleRow(r));
          });
        }
      }
    });

    body = bodyParts.join('');
  }

  // Bulk action toolbar HTML when items selected
  const bulkBarHtml = selected.size > 0 ? `
    <div class="bulk-bar">
      <span class="bulk-count">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Выбрано: <b>${selected.size}</b>
      </span>
      <div style="flex:1"></div>
      ${isMainEnt && selected.size >= 2 ? `<button class="btn sm" id="btnBulkMerge" style="background:#EBF8FA;color:var(--acc);border-color:var(--acc);font-weight:700;display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Объединить (${selected.size})
      </button>` : ''}
      ${isMainEnt ? `<button class="btn sm pri" id="btnBulkEdit" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        Массовое редактирование
      </button>` : ''}
      <button class="btn sm dgr" id="btnBulkDelete" style="background:#FFF5F5;border-color:#FEB2B2;display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        Удалить выбранные
      </button>
      <button class="btn sm" id="btnBulkClear" style="background:rgba(255,255,255,0.15);color:#fff;border-color:rgba(255,255,255,0.25)">Снять выбор</button>
    </div>` : '';

  const groupBtnLabel = hasGrouping ? `Группировка (${groupBy.length})` : 'Группировка';

  const activeColFilters = Object.keys(st.filters || {}).length;
  const hasSearch = !!(S.search && S.search.trim());
  const totalActiveFilters = activeColFilters + (hasSearch ? 1 : 0);

  const filterIndicatorHtml = totalActiveFilters > 0 ? `
    <button class="btn sm filter-active-badge" data-clrf title="Нажмите, чтобы сбросить все применённые фильтры и поиск" style="display:inline-flex;align-items:center;gap:6px;background:#FFF5F5;border-color:#FEB2B2;color:#C53030;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer;margin-left:8px;transition:all .15s">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>
      Применено фильтров: ${totalActiveFilters}
      <span style="font-weight:800;margin-left:2px;font-size:12px">✕ Сбросить</span>
    </button>
  ` : '';

  mount.innerHTML = `
    ${bulkBarHtml}
    <div class="panel table-panel">
      <div class="toolbar">
        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px">
          <span style="font-size:12.5px;color:var(--mut)">Показано <b class="mono" style="color:var(--ink)">${shown.length}</b> из <b class="mono" style="color:var(--ink)">${rows.length}</b></span>
          ${filterIndicatorHtml}
        </div>
        <div class="sp"></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <button class="btn sm ${hasGrouping ? 'pri' : ''}" id="btnTableGrouping" title="Настроить группировку таблицы" style="display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            ${groupBtnLabel}
          </button>
          ${hasGrouping ? `
            <button class="btn sm" id="btnExpandAllGroups" title="Развернуть все группы">Развернуть всё</button>
            <button class="btn sm" id="btnCollapseAllGroups" title="Свернуть все группы">Свернуть всё</button>
            <button class="btn sm" id="btnClearGrouping" title="Сбросить группировку">Сброс</button>
          ` : ''}
          <button class="btn sm" data-cols style="display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Столбцы
          </button>
        </div>
      </div>
      <div class="tbl-wrap"><table class="tbl">
        <thead>
          <tr>
            <th class="tbl-select-col"><input type="checkbox" id="chkSelectAllRows" class="tbl-select-chk" ${allShownSelected ? 'checked' : ''} title="Выбрать все"></th>
            ${canExp ? '<th style="width:30px"></th>' : ''}
            ${head}
            <th style="width:88px"></th>
          </tr>
        </thead>
        <tbody>${body || `<tr><td colspan="${totalCols}" style="padding:34px;text-align:center;color:var(--mut2)">Нет записей${S.search ? ' по запросу «' + esc(S.search) + '»' : ''}</td></tr>`}</tbody>
      </table></div>
      ${limited ? `<div style="padding:10px 14px;border-top:1px solid var(--line2)"><button class="btn sm" data-all>Показать все (${rows.length})</button></div>` : ''}
    </div>`;

  const newWrap = mount.querySelector('.tbl-wrap');
  if (newWrap) {
    newWrap.scrollTop = prevScrollTop;
    newWrap.scrollLeft = prevScrollLeft;
    newWrap.addEventListener('scroll', () => {
      TBL_SCROLL_POS[ent] = { top: newWrap.scrollTop, left: newWrap.scrollLeft };
    }, { passive: true });
  }
  if (prevWindowY > 0 && window.scrollY !== prevWindowY) {
    window.scrollTo(window.scrollX, prevWindowY);
  }

  const reRender = () => renderTableView(S, ent, mount, callbacks);

  // Bulk action handlers
  const chkSelectAll = mount.querySelector('#chkSelectAllRows');
  if (chkSelectAll) {
    chkSelectAll.onchange = () => {
      if (chkSelectAll.checked) {
        shown.forEach(r => selected.add(r.id));
      } else {
        selected.clear();
      }
      reRender();
    };
  }

  mount.querySelectorAll('input[data-sel-id]').forEach(chk => {
    chk.onclick = e => e.stopPropagation();
    chk.onchange = e => {
      const id = +chk.dataset.selId;
      if (chk.checked) selected.add(id);
      else selected.delete(id);
      reRender();
    };
  });

  const btnBulkClear = mount.querySelector('#btnBulkClear');
  if (btnBulkClear) {
    btnBulkClear.onclick = () => {
      selected.clear();
      reRender();
    };
  }

  const btnBulkDelete = mount.querySelector('#btnBulkDelete');
  if (btnBulkDelete) {
    btnBulkDelete.onclick = () => {
      confirmBox(`Удалить выбранные записи (${selected.size} шт.)? Это действие необратимо!`, async () => {
        try {
          for (const id of selected) {
            await db[ent].delete(id);
          }
          selected.clear();
          await refreshAll(S);
          if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
          toast('Записи успешно удалены', 'ok');
          reRender();
        } catch (e) {
          toast('Ошибка при удалении: ' + e.message, 'err');
        }
      });
    };
  }

  const btnBulkMerge = mount.querySelector('#btnBulkMerge');
  if (btnBulkMerge) {
    btnBulkMerge.onclick = () => {
      openMergeModal(S, ent, null, Array.from(selected), {
        autoSave: callbacks.autoSave,
        onRefreshPage: () => {
          selected.clear();
          reRender();
        }
      });
    };
  }

  const btnBulkEdit = mount.querySelector('#btnBulkEdit');
  if (btnBulkEdit) {
    btnBulkEdit.onclick = () => {
      openBulkEditModal(S, ent, Array.from(selected), callbacks, reRender);
    };
  }

  // Grouping popover & controls
  const btnGrouping = mount.querySelector('#btnTableGrouping');
  if (btnGrouping) {
    btnGrouping.onclick = (e) => {
      e.stopPropagation();
      const cols = coldefs[ent] || [];
      const curLvl1 = st.groupBy?.[0] || '';
      const curLvl2 = st.groupBy?.[1] || '';

      const optHtml = (selectedVal, excludeVal) => `
        <option value="">— Без группировки —</option>
        ${cols.filter(c => c.k !== excludeVal).map(c => `<option value="${c.k}" ${c.k === selectedVal ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
      `;

      const popHtml = `
        <div class="pt">👥 Настройка группировки</div>
        <div style="font-size:12px;color:var(--mut);margin-bottom:10px">Иерархическая группировка до 2-х уровней с агрегацией количества:</div>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:240px">
          <div class="fg">
            <label class="fl">Уровень 1 (Главная группа):</label>
            <select id="selGrpLevel1" class="slicer-select" style="width:100%">${optHtml(curLvl1, '')}</select>
          </div>
          <div class="fg">
            <label class="fl">Уровень 2 (Вложенная подгруппа):</label>
            <select id="selGrpLevel2" class="slicer-select" style="width:100%">${optHtml(curLvl2, curLvl1)}</select>
          </div>
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;border-top:1px solid var(--line2);padding-top:8px">
            <button class="btn sm" id="btnPopClearGrp">Сбросить</button>
            <button class="btn sm pri" id="btnPopApplyGrp">Применить</button>
          </div>
        </div>
      `;

      popover(btnGrouping, popHtml, (popEl) => {
        const sel1 = popEl.querySelector('#selGrpLevel1');
        const sel2 = popEl.querySelector('#selGrpLevel2');
        const btnApply = popEl.querySelector('#btnPopApplyGrp');
        const btnClr = popEl.querySelector('#btnPopClearGrp');

        if (sel1 && sel2) {
          sel1.onchange = () => {
            sel2.innerHTML = optHtml(sel2.value, sel1.value);
          };
        }

        if (btnApply) {
          btnApply.onclick = async () => {
            const newGrp = [];
            if (sel1.value) newGrp.push(sel1.value);
            if (sel2.value && sel2.value !== sel1.value) newGrp.push(sel2.value);
            st.groupBy = newGrp;
            COLLAPSED_GROUPS[ent].clear();
            await savePrefs(S);
            toast(newGrp.length ? `Группировка: ${newGrp.length} ур.` : 'Группировка отключена', 'ok');
            reRender();
          };
        }

        if (btnClr) {
          btnClr.onclick = async () => {
            st.groupBy = [];
            COLLAPSED_GROUPS[ent].clear();
            await savePrefs(S);
            toast('Группировка сброшена', 'ok');
            reRender();
          };
        }
      });
    };
  }

  // Click on group header to toggle collapse / expand
  mount.querySelectorAll('.tbl-group-hdr').forEach(hdr => {
    hdr.onclick = () => {
      const gid = hdr.dataset.grpId;
      if (COLLAPSED_GROUPS[ent].has(gid)) {
        COLLAPSED_GROUPS[ent].delete(gid);
      } else {
        COLLAPSED_GROUPS[ent].add(gid);
      }
      reRender();
    };
  });

  // Expand All Groups
  const btnExpAll = mount.querySelector('#btnExpandAllGroups');
  if (btnExpAll) {
    btnExpAll.onclick = () => {
      COLLAPSED_GROUPS[ent].clear();
      reRender();
    };
  }

  // Collapse All Groups
  const btnColAll = mount.querySelector('#btnCollapseAllGroups');
  if (btnColAll) {
    btnColAll.onclick = () => {
      mount.querySelectorAll('.tbl-group-hdr').forEach(hdr => {
        COLLAPSED_GROUPS[ent].add(hdr.dataset.grpId);
      });
      reRender();
    };
  }

  // Clear Grouping Toolbar Button
  const btnClrGrp = mount.querySelector('#btnClearGrouping');
  if (btnClrGrp) {
    btnClrGrp.onclick = async () => {
      st.groupBy = [];
      COLLAPSED_GROUPS[ent].clear();
      await savePrefs(S);
      toast('Группировка отключена', 'ok');
      reRender();
    };
  }

  // Column settings popover
  const colsBtn = mount.querySelector('[data-cols]');
  if (colsBtn) {
    colsBtn.onclick = e => {
      const allChecked = allKeys.every(k => !st.hidden.includes(k));
      popover(e.currentTarget, `<div class="pt">Видимость и порядок столбцов</div>
        <div style="padding:6px 0;border-bottom:1px solid var(--line2);margin-bottom:6px">
          <label class="pi" style="font-weight:700;color:var(--acc)"><input type="checkbox" id="chkAllCols" ${allChecked ? 'checked' : ''}> <b>Показать / скрыть все поля</b></label>
        </div>
        <div style="max-height:300px;overflow:auto">${allKeys.map(k => {
          const c = coldefs[ent].find(c => c.k === k) || { label: k };
          return `<label class="pi"><input type="checkbox" data-col="${k}" ${st.hidden.includes(k) ? '' : 'checked'}> ${esc(c.label)}</label>`;
        }).join('')}</div>
        <div style="font-size:11px;color:var(--mut);margin-top:8px">Перетаскивайте заголовки для смены порядка или тяните края для изменения ширины.</div>`,
        p => {
          const chkAll = p.querySelector('#chkAllCols');
          if (chkAll) {
            chkAll.onchange = async () => {
              const isChecked = chkAll.checked;
              st.hidden = isChecked ? [] : [...allKeys];
              p.querySelectorAll('input[data-col]').forEach(input => {
                input.checked = isChecked;
              });
              await savePrefs(S);
              reRender();
            };
          }
          p.querySelectorAll('input[data-col]').forEach(i => i.onchange = async () => {
            const k = i.dataset.col;
            st.hidden = i.checked ? st.hidden.filter(x => x !== k) : [...st.hidden, k];
            if (chkAll) {
              chkAll.checked = allKeys.every(key => !st.hidden.includes(key));
            }
            await savePrefs(S);
            reRender();
          });
        });
    };
  }

  const clrf = mount.querySelector('[data-clrf]');
  if (clrf) {
    clrf.onclick = async () => {
      st.filters = {};
      S.search = '';
      const topSearch = document.querySelector('#topSearch');
      if (topSearch) topSearch.value = '';
      await savePrefs(S);
      toast('Все фильтры и строка поиска сброшены', 'ok');
      reRender();
    };
  }

  const allBtn = mount.querySelector('[data-all]');
  if (allBtn) allBtn.onclick = () => { ROWCAP_ALL[ent] = true; reRender(); };

  mount.querySelectorAll('.fbtn').forEach(b => b.onclick = e => {
    e.stopPropagation();
    openColFilter(S, coldefs, ent, st, b.dataset.f, b, reRender);
  });

  // Column Resizing logic (Mouse & Touch)
  mount.querySelectorAll('.col-resizer').forEach(resizer => {
    const startResize = (clientX) => {
      const colKey = resizer.dataset.k;
      const th = resizer.closest('th');
      const startX = clientX;
      const startWidth = th.offsetWidth;
      resizer.classList.add('resizing');

      const onMove = ev => {
        const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
        const diff = cx - startX;
        const newW = Math.max(45, startWidth + diff);
        th.style.width = `${newW}px`;
        th.style.minWidth = `${newW}px`;
        st.widths[colKey] = newW;
      };

      const onEnd = async () => {
        resizer.classList.remove('resizing');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onMove);
        window.removeEventListener('touchend', onEnd);
        await savePrefs(S);
        reRender();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onEnd);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onEnd);
    };

    resizer.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      startResize(e.clientX);
    });

    resizer.addEventListener('touchstart', e => {
      e.stopPropagation();
      if (e.touches.length === 1) {
        startResize(e.touches[0].clientX);
      }
    }, { passive: false });
  });

  // Sort & Drag logic
  mount.querySelectorAll('.th').forEach(th => {
    th.addEventListener('click', e => {
      if (e.target.closest('.fbtn') || e.target.closest('.col-resizer')) return;
      const k = th.dataset.k;
      if (st.sort && st.sort.k === k) {
        st.sort.d = -st.sort.d;
      } else {
        st.sort = { k, d: 1 };
      }
      savePrefs(S);
      reRender();
    });
    th.addEventListener('dragstart', e => {
      if (e.target.classList.contains('col-resizer')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData('text/col', th.dataset.k);
    });
    th.addEventListener('dragover', e => e.preventDefault());
    th.addEventListener('drop', async e => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/col');
      const to = th.dataset.k;
      if (!from || from === to) return;
      st.order = st.order.filter(k => k !== from);
      st.order.splice(st.order.indexOf(to), 0, from);
      await savePrefs(S);
      reRender();
    });
  });

  mount.querySelectorAll('[data-exp]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const id = +b.dataset.exp;
    EXP[ent].has(id) ? EXP[ent].delete(id) : EXP[ent].add(id);
    reRender();
  });

  // Row Click & Right-click Context Menu
  mount.querySelectorAll('tr.rw').forEach(tr => {
    const id = +tr.dataset.id;
    const rowItem = (S[ent] || []).find(x => x.id === id);

    // Left click
    tr.onclick = e => {
      if (e.target.closest('input[type="checkbox"]')) return;
      const act = e.target.closest('[data-act]');
      if (act) {
        e.stopPropagation();
        const action = act.dataset.act;
        if (action === 'view' && callbacks.onView) callbacks.onView(ent, id);
        if (action === 'edit' && callbacks.onEdit) callbacks.onEdit(ent, id);
        if (action === 'del' && callbacks.onDelete) callbacks.onDelete(ent, id);
        return;
      }
      if (callbacks.onView) callbacks.onView(ent, id);
    };

    // Right click Context Menu (ПКМ) & Touch Long Press
    const triggerCtx = (eClientX, eClientY) => {
      if (!rowItem) return;
      const selIds = selected.has(id) ? Array.from(selected) : [id];
      const items = getCommonContextMenuItems(S, ent, id, callbacks, reRender, { selectedIds: selIds });
      showContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX: eClientX,
        clientY: eClientY
      }, items);
    };

    tr.oncontextmenu = e => {
      e.preventDefault();
      triggerCtx(e.clientX, e.clientY);
    };

    let touchTimer = null;
    tr.ontouchstart = e => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      touchTimer = setTimeout(() => {
        triggerCtx(touch.clientX, touch.clientY);
      }, 500);
    };
    tr.ontouchend = () => { if (touchTimer) clearTimeout(touchTimer); };
    tr.ontouchmove = () => { if (touchTimer) clearTimeout(touchTimer); };
  });

  // Handle + Add Sub item clicks inside expanded tree rows
  mount.querySelectorAll('[data-addsub]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const parentId = +btn.dataset.addsub;
      const parentEnt = btn.dataset.parentent || ent;
      if (parentEnt === 'projects') {
        if (callbacks.onAdd) callbacks.onAdd('tasks', { projectId: parentId });
      } else if (parentEnt === 'tasks') {
        if (callbacks.onAdd) callbacks.onAdd('changes', { taskId: parentId });
      }
    };
  });

  // Handle click on child item rows inside expanded tree
  mount.querySelectorAll('.sub-rw').forEach(subtr => {
    subtr.onclick = e => {
      e.stopPropagation();
      const cid = +subtr.dataset.cid;
      const cent = subtr.dataset.cent;
      if (cid && cent && callbacks.onView) {
        callbacks.onView(cent, cid);
      }
    };
  });
}

// Modal for bulk/mass editing multiple selected records
function openBulkEditModal(S, ent, selectedIds, callbacks, onComplete) {
  const statusDict = ent === 'projects' ? (S.projectStatuses || []) : (S.taskStatuses || []);
  const devsList = (S.employees || []).filter(e => e.role === 'dev');
  const agentsList = (S.employees || []).filter(e => e.role === 'agent');
  const custsList = S.customers || [];

  const body = `
    <div style="font-size:13px;color:var(--mut);margin-bottom:14px">
      Выбрано записей: <b>${selectedIds.length}</b>. Отметьте галочками поля, которые нужно изменить у всех выбранных записей.
    </div>
    <form id="bulkForm" style="display:flex;flex-direction:column;gap:12px">
      <!-- Status -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAFAF6;border:1px solid var(--line);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;width:160px;cursor:pointer">
          <input type="checkbox" id="chkApplyStatus">
          <span>Статус:</span>
        </label>
        <select id="bulkStatus" style="flex:1" disabled>
          ${renderColorOptions(statusDict, null, '— Не менять —')}
        </select>
      </div>

      <!-- Priority -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAFAF6;border:1px solid var(--line);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;width:160px;cursor:pointer">
          <input type="checkbox" id="chkApplyPriority">
          <span>Приоритет:</span>
        </label>
        <select id="bulkPriority" style="flex:1" disabled>
          ${renderColorOptions(S.priorities, null, '— Не менять —')}
        </select>
      </div>

      <!-- Stage for projects -->
      ${ent === 'projects' && S.stages && S.stages.length ? `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAFAF6;border:1px solid var(--line);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;width:160px;cursor:pointer">
          <input type="checkbox" id="chkApplyStage">
          <span>Текущий этап:</span>
        </label>
        <select id="bulkStage" style="flex:1" disabled>
          ${renderColorOptions(S.stages, null, '— Не менять —')}
        </select>
      </div>` : ''}

      <!-- Customer -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAFAF6;border:1px solid var(--line);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;width:160px;cursor:pointer">
          <input type="checkbox" id="chkApplyCustomer">
          <span>Заказчик:</span>
        </label>
        <select id="bulkCustomer" style="flex:1" disabled>
          <option value="">— Не менять —</option>
          ${custsList.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>

      <!-- Dev -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAFAF6;border:1px solid var(--line);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;width:160px;cursor:pointer">
          <input type="checkbox" id="chkApplyDev">
          <span>Разработчик:</span>
        </label>
        <select id="bulkDev" style="flex:1" disabled>
          ${renderColorOptions(devsList, null, '— Не менять —')}
        </select>
      </div>

      <!-- Agent -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAFAF6;border:1px solid var(--line);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;width:160px;cursor:pointer">
          <input type="checkbox" id="chkApplyAgent">
          <span>Агент (ПМ):</span>
        </label>
        <select id="bulkAgent" style="flex:1" disabled>
          ${renderColorOptions(agentsList, null, '— Не менять —')}
        </select>
      </div>

      <!-- Dates -->
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#FAFAF6;border:1px solid var(--line);border-radius:8px">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;width:160px;cursor:pointer">
          <input type="checkbox" id="chkApplyDates">
          <span>Сроки:</span>
        </label>
        <div style="display:flex;gap:6px;flex:1">
          <input type="date" id="bulkDateStart" disabled style="flex:1" title="Дата начала">
          <input type="date" id="bulkDateEnd" disabled style="flex:1" title="Дата окончания">
        </div>
      </div>
    </form>
  `;

  modal({
    title: `Массовое редактирование (${selectedIds.length} записей)`,
    sub: ent.toUpperCase(),
    wide: false,
    body,
    foot: `<button class="btn" data-x>Отмена</button><button class="btn pri" id="btnSaveBulk">Применить ко всем</button>`,
    mount(box) {
      const bindToggle = (chkId, ...inputIds) => {
        const chk = box.el.querySelector('#' + chkId);
        if (chk) {
          chk.onchange = () => {
            inputIds.forEach(id => {
              const inp = box.el.querySelector('#' + id);
              if (inp) inp.disabled = !chk.checked;
            });
          };
        }
      };

      bindToggle('chkApplyStatus', 'bulkStatus');
      bindToggle('chkApplyPriority', 'bulkPriority');
      bindToggle('chkApplyStage', 'bulkStage');
      bindToggle('chkApplyCustomer', 'bulkCustomer');
      bindToggle('chkApplyDev', 'bulkDev');
      bindToggle('chkApplyAgent', 'bulkAgent');
      bindToggle('chkApplyDates', 'bulkDateStart', 'bulkDateEnd');

      box.el.querySelector('[data-x]').onclick = () => box.close();

      const btnSave = box.el.querySelector('#btnSaveBulk');
      if (btnSave) {
        btnSave.onclick = async () => {
          const chkStatus = box.el.querySelector('#chkApplyStatus')?.checked;
          const chkPriority = box.el.querySelector('#chkApplyPriority')?.checked;
          const chkStage = box.el.querySelector('#chkApplyStage')?.checked;
          const chkCustomer = box.el.querySelector('#chkApplyCustomer')?.checked;
          const chkDev = box.el.querySelector('#chkApplyDev')?.checked;
          const chkAgent = box.el.querySelector('#chkApplyAgent')?.checked;
          const chkDates = box.el.querySelector('#chkApplyDates')?.checked;

          if (!chkStatus && !chkPriority && !chkStage && !chkCustomer && !chkDev && !chkAgent && !chkDates) {
            toast('Выберите хотя бы одно поле для изменения', 'err');
            return;
          }

          const statusVal = +box.el.querySelector('#bulkStatus')?.value || null;
          const priorityVal = +box.el.querySelector('#bulkPriority')?.value || null;
          const stageVal = +box.el.querySelector('#bulkStage')?.value || null;
          const customerVal = +box.el.querySelector('#bulkCustomer')?.value || null;
          const devVal = +box.el.querySelector('#bulkDev')?.value || null;
          const agentVal = +box.el.querySelector('#bulkAgent')?.value || null;
          const startVal = box.el.querySelector('#bulkDateStart')?.value || '';
          const endVal = box.el.querySelector('#bulkDateEnd')?.value || '';

          try {
            for (const id of selectedIds) {
              const item = (S[ent] || []).find(x => x.id === id);
              if (item) {
                if (chkStatus) item.statusId = statusVal;
                if (chkPriority) item.priorityId = priorityVal;
                if (chkStage && ent === 'projects') item.stageId = stageVal;
                if (chkCustomer) item.customerId = customerVal;
                if (chkDev) item.devId = devVal;
                if (chkAgent) item.agentId = agentVal;
                if (chkDates) {
                  if (startVal) item.start = startVal;
                  if (endVal) item.end = endVal;
                }
                item.updatedAt = nowIso();
                await db[ent].put(item);
              }
            }

            await refreshAll(S);
            if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
            SELECTED_ROWS[ent].clear();
            toast(`Обновлено записей: ${selectedIds.length}`, 'ok');
            box.close();
            if (onComplete) onComplete();
          } catch (e) {
            toast('Ошибка массового обновления: ' + e.message, 'err');
          }
        };
      }
    }
  });
}

// src/components/kanban/KanbanView.js
import { esc } from '../../utils/dom.js';
import { colorOf } from '../../utils/color.js';
import { fmtD, nowIso } from '../../utils/date.js';
import { cardFields, savePrefs } from '../../core/prefs.js';
import { ENT } from '../../core/state.js';
import { statFor, pri, emp, prj, stg } from '../../services/refs.js';
import { chipHtml } from '../table/renderers.js';
import { matchSearch } from '../table/filters.js';
import { getColDefs } from '../table/colDefs.js';
import { modal, confirmBox } from '../../ui/modal.js';
import { db, refreshAll } from '../../core/db.js';
import { setDbBeacon, afterChange } from '../../utils/logger.js';
import { toast } from '../../ui/toast.js';
import { showContextMenu } from '../../ui/contextMenu.js';
import { getCommonContextMenuItems } from '../../services/quickActions.js';
import { popover, closePop } from '../../ui/popover.js';
import { getViewFilters, matchViewFilters, countActiveViewFilters, resetViewFilters, openViewFiltersPopover } from '../../ui/viewFilters.js';

function kbGroups(S, ent, by) {
  const unb = { id: null, name: 'Не назначено', color: '#98A2B3' };
  const items = S[ent] || [];
  const assignedIds = new Set(items.map(x => x[by]).filter(Boolean));
  if (by === 'devId') return [...S.employees.filter(e => e.role === 'dev' && (e.active !== false && e.active !== 0 || assignedIds.has(e.id))), unb];
  if (by === 'agentId') return [...S.employees.filter(e => e.role === 'agent' && (e.active !== false && e.active !== 0 || assignedIds.has(e.id))), unb];
  if (by === 'priorityId') return [...S.priorities, unb];
  if (by === 'stageId') return [...S.stages, unb];
  return [...(ent === 'projects' ? S.projectStatuses : S.taskStatuses), unb];
}

function getFieldOptions(S, ent, field) {
  if (field === 'statusId') return (ent === 'projects' ? S.projectStatuses : S.taskStatuses).map(s => ({ id: s.id, name: s.name, color: colorOf(s) }));
  if (field === 'priorityId') return S.priorities.map(p => ({ id: p.id, name: p.name, color: colorOf(p) }));
  if (field === 'stageId') return S.stages.map(st => ({ id: st.id, name: st.name, color: colorOf(st) }));
  if (field === 'devId') return S.employees.filter(e => e.role === 'dev' && e.active !== false && e.active !== 0).map(e => ({ id: e.id, name: e.name, color: colorOf(e) }));
  if (field === 'agentId') return S.employees.filter(e => e.role === 'agent' && e.active !== false && e.active !== 0).map(e => ({ id: e.id, name: e.name, color: colorOf(e) }));
  return [];
}

export function openCardSettings(S, defaultView = 'kb', reRender) {
  let activeTab = defaultView === 'tl' ? 'tl' : 'kb';
  const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };
  const ents = ['projects'];
  if (mods.tasks) ents.push('tasks');
  if (mods.changes) ents.push('changes');
  const NAMES = {
    num: 'Номер / Код',
    name: 'Название',
    dates: 'Даты (период / срок)',
    status: 'Статус',
    priority: 'Приоритет',
    owner: 'Ответственный (разработчик/агент)',
    project: 'Проект (для задач/изменений)',
    stage: 'Этап (для проектов)',
    progress: 'Прогресс этапов (для проектов)',
    lastNote: 'Последняя заметка',
    checklists: 'Чек-лист (прогресс)'
  };

  const renderBody = () => {
    const prefKey = activeTab === 'kb' ? 'kbCards' : 'tlCards';
    S.prefs[prefKey] = S.prefs[prefKey] || {};

    return `
      <div style="display:flex;gap:6px;border-bottom:1px solid var(--line2);margin-bottom:14px;padding-bottom:2px">
        <button type="button" class="btn sm tab-view-btn ${activeTab === 'kb' ? 'pri' : ''}" data-tab="kb" style="font-weight:700">📋 Карточки Канбана</button>
        <button type="button" class="btn sm tab-view-btn ${activeTab === 'tl' ? 'pri' : ''}" data-tab="tl" style="font-weight:700">📊 Полосы Ганта / Временной шкалы</button>
      </div>

      <div class="setgrid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));gap:14px">
        ${ents.map(ent => {
          const cf = cardFields(S, ent, activeTab);
          const isAll = cf.list.length === cf.all.length;
          return `
            <div class="setcard" style="padding:12px 14px;border-radius:8px;border:1px solid var(--line2);background:#FAFAFA">
              <h3 style="font-size:14px;margin-bottom:8px;color:var(--ink)">${ENT[ent].ru}</h3>
              <label class="cb" style="font-weight:700;color:var(--acc);margin-bottom:10px;padding-bottom:6px;border-bottom:1px dashed var(--line2);display:flex;align-items:center;gap:6px">
                <input type="checkbox" data-all-ent="${ent}" ${isAll ? 'checked' : ''}>
                <span>Показать / скрыть все</span>
              </label>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${cf.all.map(f => {
                  if ((f === 'stage' || f === 'progress') && ent !== 'projects') return '';
                  if (f === 'project' && ent === 'projects') return '';
                  return `
                    <label class="cb" style="font-size:13px;display:flex;align-items:center;gap:6px">
                      <input type="checkbox" data-ent="${ent}" data-f="${f}" ${cf.list.includes(f) ? 'checked' : ''}>
                      <span>${NAMES[f] || f}</span>
                    </label>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  modal({
    title: 'Настройка полей карточек',
    sub: activeTab === 'kb' ? 'КАНБАН' : 'ГАНТ / ВРЕМЕННАЯ ШКАЛА',
    wide: true,
    body: `<div id="cardSettingsContainer">${renderBody()}</div>`,
    foot: '<button class="btn pri" data-ok>Готово</button>',
    mount(box) {
      const container = box.el.querySelector('#cardSettingsContainer');

      const bindEvents = () => {
        // Tab switching
        box.el.querySelectorAll('.tab-view-btn').forEach(btn => {
          btn.onclick = () => {
            activeTab = btn.dataset.tab;
            container.innerHTML = renderBody();
            bindEvents();
          };
        });

        // Toggle all
        box.el.querySelectorAll('input[data-all-ent]').forEach(i => i.onchange = async () => {
          const targetEnt = i.dataset.allEnt;
          const cf = cardFields(S, targetEnt, activeTab);
          const prefKey = activeTab === 'kb' ? 'kbCards' : 'tlCards';
          S.prefs[prefKey][targetEnt] = i.checked ? [...cf.all] : [];
          await savePrefs(S);
          box.el.querySelectorAll(`input[data-ent="${targetEnt}"]`).forEach(cb => cb.checked = i.checked);
        });

        // Toggle single field
        box.el.querySelectorAll('input[data-f]').forEach(i => i.onchange = async () => {
          const targetEnt = i.dataset.ent;
          const prefKey = activeTab === 'kb' ? 'kbCards' : 'tlCards';
          const l = S.prefs[prefKey][targetEnt] || [];
          const f = i.dataset.f;
          const newList = i.checked ? [...new Set([...l, f])] : l.filter(x => x !== f);
          S.prefs[prefKey][targetEnt] = newList;
          await savePrefs(S);
          const cf = cardFields(S, targetEnt, activeTab);
          const allChk = box.el.querySelector(`input[data-all-ent="${targetEnt}"]`);
          if (allChk) {
            allChk.checked = newList.length === cf.all.length;
          }
        });
      };

      bindEvents();

      box.el.querySelector('[data-ok]').onclick = () => {
        box.close();
        if (reRender) reRender();
      };
    }
  });
}

export function openCustomBoardModal(S, ent, boardToEdit = null, reRender) {
  let columnsDraft = boardToEdit
    ? JSON.parse(JSON.stringify(boardToEdit.columns || []))
    : [
        { id: 'c_' + Date.now() + '_1', name: 'Бэклог', color: '#98A2B3', field: 'statusId', val: 1, wipLimit: 0 },
        { id: 'c_' + Date.now() + '_2', name: 'В работе', color: '#2B6CB0', field: 'statusId', val: 2, wipLimit: 5 },
        { id: 'c_' + Date.now() + '_3', name: 'На проверке', color: '#D69E2E', field: 'statusId', val: 3, wipLimit: 3 },
        { id: 'c_' + Date.now() + '_4', name: 'Завершено', color: '#38A169', field: 'statusId', val: 4, wipLimit: 0 }
      ];

  function renderColumnsList(container) {
    container.innerHTML = columnsDraft.map((col, idx) => {
      const fieldOpts = getFieldOptions(S, ent, col.field);
      return `<div class="panel col-edit-item" data-idx="${idx}" style="padding:10px;margin-bottom:8px;background:var(--bg);border:1px solid var(--line);border-radius:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <input type="color" data-field="color" value="${col.color || '#3B82F6'}" style="width:28px;height:28px;padding:0;border:none;background:none;cursor:pointer" title="Цвет колонки">
          <input type="text" data-field="name" class="ipt" placeholder="Название колонки" value="${esc(col.name)}" style="flex:1;min-width:140px;font-weight:600">
          
          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:11px;color:var(--mut)">Поле:</span>
            <select data-field="field" class="ipt sm" style="width:110px">
              <option value="statusId" ${col.field === 'statusId' ? 'selected' : ''}>Статус</option>
              <option value="priorityId" ${col.field === 'priorityId' ? 'selected' : ''}>Приоритет</option>
              ${ent === 'projects' ? `<option value="stageId" ${col.field === 'stageId' ? 'selected' : ''}>Этап</option>` : ''}
              <option value="devId" ${col.field === 'devId' ? 'selected' : ''}>Разработчик</option>
              <option value="agentId" ${col.field === 'agentId' ? 'selected' : ''}>Агент</option>
            </select>
          </div>

          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:11px;color:var(--mut)">Значение:</span>
            <select data-field="val" class="ipt sm" style="width:130px">
              <option value="">(Все)</option>
              ${fieldOpts.map(o => `<option value="${o.id}" ${String(col.val) === String(o.id) ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
            </select>
          </div>

          <div style="display:flex;align-items:center;gap:4px">
            <span style="font-size:11px;color:var(--mut)" title="Лимит одновременно выполняемых задач">WIP:</span>
            <input type="number" min="0" data-field="wipLimit" class="ipt sm" value="${col.wipLimit || 0}" style="width:54px" title="0 = без лимита">
          </div>

          <div style="display:flex;align-items:center;gap:2px;margin-left:auto">
            <button class="btn sm" data-act="up" ${idx === 0 ? 'disabled' : ''} title="Вверх">▲</button>
            <button class="btn sm" data-act="down" ${idx === columnsDraft.length - 1 ? 'disabled' : ''} title="Вниз">▼</button>
            <button class="btn sm err" data-act="del" title="Удалить колонку">🗑</button>
          </div>
        </div>
      </div>`;
    }).join('');

    // Bind event listeners
    container.querySelectorAll('.col-edit-item').forEach(el => {
      const idx = +el.dataset.idx;

      el.querySelectorAll('[data-field]').forEach(input => {
        input.onchange = () => {
          const f = input.dataset.field;
          let val = input.value;
          if (f === 'wipLimit') val = Math.max(0, parseInt(val, 10) || 0);
          if (f === 'val' && val !== '') val = isNaN(+val) ? val : +val;

          columnsDraft[idx][f] = val;

          if (f === 'field') {
            // Field changed, update default val
            const opts = getFieldOptions(S, ent, val);
            columnsDraft[idx].val = opts[0] ? opts[0].id : '';
            renderColumnsList(container);
          }
        };
      });

      el.querySelectorAll('[data-act]').forEach(btn => {
        btn.onclick = () => {
          const act = btn.dataset.act;
          if (act === 'up' && idx > 0) {
            const tmp = columnsDraft[idx];
            columnsDraft[idx] = columnsDraft[idx - 1];
            columnsDraft[idx - 1] = tmp;
            renderColumnsList(container);
          } else if (act === 'down' && idx < columnsDraft.length - 1) {
            const tmp = columnsDraft[idx];
            columnsDraft[idx] = columnsDraft[idx + 1];
            columnsDraft[idx + 1] = tmp;
            renderColumnsList(container);
          } else if (act === 'del') {
            columnsDraft.splice(idx, 1);
            renderColumnsList(container);
          }
        };
      });
    });
  }

  modal({
    title: boardToEdit ? 'Редактирование доски' : 'Новая кастомная доска',
    sub: `МОДУЛЬ: ${ENT[ent].ru.toUpperCase()}`,
    wide: true,
    body: `<div style="display:flex;flex-direction:column;gap:12px">
      <div class="form-group">
        <label style="font-weight:700;font-size:12px;color:var(--ink)">Название вариантa доски</label>
        <input type="text" id="kbBoardName" class="ipt" placeholder="Например: Спринт доска, Отдел QA, VIP баги..." value="${boardToEdit ? esc(boardToEdit.name) : ''}">
      </div>
      <div class="form-group">
        <label style="font-weight:600;font-size:12px;color:var(--mut)">Описание / Примечание</label>
        <input type="text" id="kbBoardDesc" class="ipt" placeholder="Краткое назначение этой доски..." value="${boardToEdit ? esc(boardToEdit.description || '') : ''}">
      </div>

      <div style="border-top:1px solid var(--line2);padding-top:12px;margin-top:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <span style="font-weight:700;font-size:13px;color:var(--ink)">Колонки доски</span>
          <button class="btn sm pri" id="btnAddColDraft">➕ Добавить колонку</button>
        </div>
        <div id="colsListContainer" style="max-height:340px;overflow-y:auto;padding-right:4px"></div>
      </div>
    </div>`,
    foot: '<button class="btn" data-cancel>Отмена</button><button class="btn pri" data-save>Сохранить доску</button>',
    mount(box) {
      const colsContainer = box.el.querySelector('#colsListContainer');
      renderColumnsList(colsContainer);

      box.el.querySelector('#btnAddColDraft').onclick = () => {
        const defaultOpts = getFieldOptions(S, ent, 'statusId');
        columnsDraft.push({
          id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          name: 'Новая колонка',
          color: '#3B82F6',
          field: 'statusId',
          val: defaultOpts[0] ? defaultOpts[0].id : '',
          wipLimit: 0
        });
        renderColumnsList(colsContainer);
      };

      box.el.querySelector('[data-cancel]').onclick = () => box.close();

      box.el.querySelector('[data-save]').onclick = async () => {
        const nameInput = box.el.querySelector('#kbBoardName');
        const descInput = box.el.querySelector('#kbBoardDesc');
        const name = nameInput ? nameInput.value.trim() : '';
        const desc = descInput ? descInput.value.trim() : '';

        if (!name) {
          toast('Укажите название доски', 'err');
          if (nameInput) nameInput.focus();
          return;
        }

        if (!columnsDraft.length) {
          toast('Добавьте хотя бы одну колонку', 'err');
          return;
        }

        try {
          if (boardToEdit) {
            boardToEdit.name = name;
            boardToEdit.description = desc;
            boardToEdit.columns = columnsDraft;
            boardToEdit.updatedAt = nowIso();
            await db.kanbanBoards.put(boardToEdit);
          } else {
            const newBoard = {
              module: ent,
              name,
              description: desc,
              columns: columnsDraft,
              createdAt: nowIso(),
              updatedAt: nowIso()
            };
            const newId = await db.kanbanBoards.add(newBoard);
            S.prefs.kanbanGroup[ent] = 'cb_' + newId;
          }

          await savePrefs(S);
          await refreshAll(S);
          toast('Канбан доска сохранена', 'ok');
          box.close();
          if (reRender) reRender();
        } catch (err) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка сохранения: ' + err.message, 'err');
        }
      };
    }
  });
}

export function openAddColumnModal(S, ent, activeBoard, reRender) {
  if (!activeBoard) return;
  const fieldOpts = getFieldOptions(S, ent, 'statusId');

  modal({
    title: 'Добавление колонки',
    sub: `ДОСКА: ${activeBoard.name.toUpperCase()}`,
    body: `<div style="display:flex;flex-direction:column;gap:10px">
      <div class="form-group">
        <label style="font-weight:700;font-size:12px">Название колонки</label>
        <input type="text" id="newColName" class="ipt" placeholder="например: В ревью, На согласовании...">
      </div>
      <div style="display:flex;gap:10px">
        <div class="form-group" style="flex:1">
          <label style="font-weight:600;font-size:12px;color:var(--mut)">Цвет</label>
          <input type="color" id="newColColor" value="#3B82F6" style="width:100%;height:36px;padding:2px;border:1px solid var(--line);border-radius:6px;cursor:pointer">
        </div>
        <div class="form-group" style="flex:1">
          <label style="font-weight:600;font-size:12px;color:var(--mut)">Лимит WIP</label>
          <input type="number" min="0" id="newColWip" class="ipt" value="0" placeholder="0 = без лимита">
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <div class="form-group" style="flex:1">
          <label style="font-weight:600;font-size:12px;color:var(--mut)">Поле карточки</label>
          <select id="newColField" class="ipt">
            <option value="statusId">Статус</option>
            <option value="priorityId">Приоритет</option>
            ${ent === 'projects' ? '<option value="stageId">Этап</option>' : ''}
            <option value="devId">Разработчик</option>
            <option value="agentId">Агент</option>
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label style="font-weight:600;font-size:12px;color:var(--mut)">Значение</label>
          <select id="newColVal" class="ipt">
            <option value="">(Все)</option>
            ${fieldOpts.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>`,
    foot: '<button class="btn" data-cancel>Отмена</button><button class="btn pri" data-add>Добавить</button>',
    mount(box) {
      const fieldSelect = box.el.querySelector('#newColField');
      const valSelect = box.el.querySelector('#newColVal');

      if (fieldSelect && valSelect) {
        fieldSelect.onchange = () => {
          const opts = getFieldOptions(S, ent, fieldSelect.value);
          valSelect.innerHTML = `<option value="">(Все)</option>` + opts.map(o => `<option value="${o.id}">${esc(o.name)}</option>`).join('');
        };
      }

      box.el.querySelector('[data-cancel]').onclick = () => box.close();

      box.el.querySelector('[data-add]').onclick = async () => {
        const name = box.el.querySelector('#newColName').value.trim();
        const color = box.el.querySelector('#newColColor').value;
        const wipLimit = Math.max(0, parseInt(box.el.querySelector('#newColWip').value, 10) || 0);
        const field = fieldSelect.value;
        let val = valSelect.value;
        if (val !== '') val = isNaN(+val) ? val : +val;

        if (!name) {
          toast('Укажите название колонки', 'err');
          return;
        }

        activeBoard.columns = activeBoard.columns || [];
        activeBoard.columns.push({
          id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          name,
          color,
          field,
          val,
          wipLimit
        });
        activeBoard.updatedAt = nowIso();

        try {
          await db.kanbanBoards.put(activeBoard);
          await refreshAll(S);
          toast(`Колонка «${name}» добавлена`, 'ok');
          box.close();
          if (reRender) reRender();
        } catch (e) {
          toast('Ошибка сохранения колонки', 'err');
        }
      };
    }
  });
}

const SORT_OPTIONS = [
  { k: '', label: 'По умолчанию' },
  { k: 'name', label: 'По названию' },
  { k: 'num', label: 'По коду / номеру' },
  { k: 'start', label: 'По дате начала' },
  { k: 'end', label: 'По дате окончания' },
  { k: 'priorityId', label: 'По приоритету' },
  { k: 'statusId', label: 'По статусу' },
  { k: 'createdAt', label: 'По дате создания' }
];

const KB_SCROLL_POS = {};

export function renderKanbanView(S, ent, mount, callbacks = {}) {
  const prevKb = mount.querySelector('.kb');
  const prevBoardLeft = prevKb ? prevKb.scrollLeft : (KB_SCROLL_POS[ent]?.boardLeft || 0);
  const prevBoardTop = prevKb ? prevKb.scrollTop : (KB_SCROLL_POS[ent]?.boardTop || 0);
  const prevCols = KB_SCROLL_POS[ent]?.cols ? { ...KB_SCROLL_POS[ent].cols } : {};
  mount.querySelectorAll('.kb-body').forEach(b => {
    if (b.dataset.colgid) prevCols[b.dataset.colgid] = b.scrollTop;
  });
  const prevWindowY = window.scrollY;

  const coldefs = getColDefs(S);
  const customBoards = (S.kanbanBoards || []).filter(b => b.module === ent);

  const stdOpts = ent === 'projects'
    ? [['statusId', 'Статус'], ['priorityId', 'Приоритет'], ['stageId', 'Этап'], ['devId', 'Разработчик (гл.)'], ['agentId', 'Агент (гл.)']]
    : [['statusId', 'Статус'], ['priorityId', 'Приоритет'], ['devId', 'Разработчик (гл.)'], ['agentId', 'Агент (гл.)']];

  let by = S.prefs.kanbanGroup[ent] || 'statusId';
  let activeCustomBoard = null;

  if (by.startsWith('cb_')) {
    const boardId = +by.replace('cb_', '');
    activeCustomBoard = customBoards.find(b => b.id === boardId);
    if (!activeCustomBoard) {
      by = 'statusId';
      S.prefs.kanbanGroup[ent] = 'statusId';
    }
  }

  let groups = [];
  if (activeCustomBoard) {
    groups = activeCustomBoard.columns.map(c => ({
      id: c.id,
      name: c.name,
      color: c.color || '#3B82F6',
      field: c.field,
      val: c.val,
      wipLimit: c.wipLimit || 0
    }));
  } else {
    groups = kbGroups(S, ent, by);
  }

  // Apply custom column order if saved
  S.prefs.kanbanColOrder = S.prefs.kanbanColOrder || {};
  const colOrderKey = `${ent}_${by}`;
  const savedColOrder = S.prefs.kanbanColOrder[colOrderKey];
  if (Array.isArray(savedColOrder) && savedColOrder.length) {
    groups.sort((a, b) => {
      const ia = savedColOrder.indexOf(String(a.id ?? '__null'));
      const ib = savedColOrder.indexOf(String(b.id ?? '__null'));
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });
  }

  S.prefs.kanbanColSort = S.prefs.kanbanColSort || {};
  S.prefs.kanbanCardOrder = S.prefs.kanbanCardOrder || {};

  const kbFilters = getViewFilters(S, ent, 'kb');
  let rows = S[ent].filter(r => matchSearch(S, coldefs, ent, r) && matchViewFilters(S, ent, r, kbFilters));
  const cf = cardFields(S, ent, 'kb');

  const colsHtml = groups.map(g => {
    const gidStr = String(g.id ?? '__null');
    const colKey = `${ent}_${by}_${gidStr}`;
    const colSort = S.prefs.kanbanColSort[colKey] || { field: '', dir: 'asc' };
    const savedCardOrder = S.prefs.kanbanCardOrder[colKey] || [];

    let items = [];
    if (activeCustomBoard) {
      items = rows.filter(r => {
        if (g.field && g.val !== undefined && g.val !== '' && g.val !== null) {
          return String(r[g.field] ?? '') === String(g.val);
        }
        return true;
      });
    } else {
      items = rows.filter(r => (r[by] ?? null) === (g.id ?? null));
    }

    if (colSort.field) {
      const f = colSort.field;
      const mult = colSort.dir === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        let va = a[f] ?? '';
        let vb = b[f] ?? '';
        if (typeof va === 'string') return va.localeCompare(vb, 'ru', { numeric: true }) * mult;
        return (va < vb ? -1 : va > vb ? 1 : 0) * mult;
      });
    } else if (savedCardOrder.length) {
      items.sort((a, b) => {
        const ia = savedCardOrder.indexOf(a.id);
        const ib = savedCardOrder.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return 0;
      });
    }

    const cards = items.slice(0, 200).map(r => {
      const st = statFor(S, ent, r.statusId);
      const pr = pri(S, r.priorityId);
      const dv = emp(S, r.devId);
      const ag = emp(S, r.agentId);
      const pj = prj(S, r.projectId);
      const sg = stg(S, r.stageId);
      const own = by === 'devId' || by === 'agentId' ? emp(S, r[by]) : (dv || ag);

      let parts = '';
      if (cf.list.includes('num')) parts += `<div class="kn">${esc(r.num)}</div>`;
      if (cf.list.includes('name')) parts += `<div class="kt">${esc(r.name)}</div>`;
      let chips = '';
      if (cf.list.includes('status') && st) chips += chipHtml(st.name, colorOf(st));
      if (cf.list.includes('priority') && pr) chips += chipHtml(pr.name, colorOf(pr));
      if (cf.list.includes('stage') && sg) chips += chipHtml(sg.name, colorOf(sg));
      if (chips) parts += `<div class="krow">${chips}</div>`;
      if (cf.list.includes('dates') && (r.start || r.createdAt)) {
        const sDate = r.start || r.createdAt?.slice(0, 10);
        const eDate = r.end || sDate;
        parts += `<div class="krow"><span class="kdate">📅 ${fmtD(sDate)} → ${fmtD(eDate)}</span></div>`;
      }
      if (cf.list.includes('owner') && own && by !== 'devId' && by !== 'agentId') parts += `<div class="krow">${chipHtml(own.name, colorOf(own))}</div>`;
      if (cf.list.includes('project') && pj && ent !== 'projects') parts += `<div class="kprj">▤ ${esc(pj.name)}</div>`;
      if (cf.list.includes('lastNote')) {
        let ln = '';
        if (r.notes && r.notes.length) {
          const sorted = [...r.notes].sort((a, b) => {
            const tA = a.createdAt || a.updatedAt || '';
            const tB = b.createdAt || b.updatedAt || '';
            return tA < tB ? 1 : (tA > tB ? -1 : 0);
          });
          ln = sorted[0]?.text || '';
        } else if (r.note) {
          ln = r.note;
        }
        if (ln) {
          parts += `<div class="krow" style="font-size:11.5px;color:var(--ink);background:rgba(0,0,0,0.03);padding:3px 6px;border-radius:4px;border-left:2px solid var(--acc);margin-top:2px" title="Последняя заметка: ${esc(ln)}">📝 ${esc(ln.length > 55 ? ln.slice(0, 55) + '…' : ln)}</div>`;
        }
      }
      if (cf.list.includes('checklists') && r.checklists && r.checklists.length) {
        const doneCount = r.checklists.filter(c => c.done).length;
        const totalCount = r.checklists.length;
        const pct = Math.round((doneCount / totalCount) * 100);
        parts += `<div class="krow" style="font-size:11px;color:var(--mut);display:flex;align-items:center;gap:5px;margin-top:2px">
          <span>☑️ ${doneCount}/${totalCount}</span>
          <div class="progbar" style="height:5px;flex:1"><i style="width:${pct}%;background:${pct === 100 ? '#2F9E63' : 'var(--acc)'}"></i></div>
          <span class="mono" style="font-weight:700">${pct}%</span>
        </div>`;
      }
      if (cf.list.includes('progress') && ent === 'projects' && S.stages && S.stages.length) {
        const sum = S.stages.reduce((acc, s) => acc + (r.stageProgress ? (r.stageProgress[s.id] || 0) : 0), 0);
        const pVal = Math.round(sum / S.stages.length);
        parts += `<div class="krow" style="margin-top:4px"><div class="progbar" style="height:6px;flex:1"><i style="width:${pVal}%"></i></div><span class="mono" style="font-size:11px;font-weight:700;color:var(--acc)">${pVal}%</span></div>`;
      }

      return `<div class="kcard" draggable="true" data-id="${r.id}" data-colgid="${gidStr}" style="border-left:3px solid ${colorOf(st || pr || '#999')}">${parts}</div>`;
    }).join('');

    const sortIcon = colSort.field ? (colSort.dir === 'desc' ? '⬇' : '⬆') : '⇅';
    const sortFieldLabel = SORT_OPTIONS.find(o => o.k === colSort.field)?.label || '';

    const isWipExceeded = g.wipLimit > 0 && items.length > g.wipLimit;
    const badgeText = g.wipLimit > 0 ? `${items.length}/${g.wipLimit}` : `${items.length}`;
    const badgeTitle = isWipExceeded ? `Превышен лимит WIP (${g.wipLimit})` : (g.wipLimit > 0 ? `Лимит WIP: ${g.wipLimit}` : 'Количество элементов');

    return `<div class="kb-col" data-gid="${gidStr}" style="--kc:${colorOf(g)}">
      <div class="kb-h" draggable="true" data-colgid="${gidStr}">
        <span class="col-drag-handle" title="Зажмите и тяните для перемещения колонки" style="cursor:grab;color:var(--mut2);font-weight:700;margin-right:2px">⋮⋮</span>
        <span class="dot" style="background:${colorOf(g)}"></span>
        <b>${esc(g.name)}</b>
        <span class="n ${isWipExceeded ? 'wip-exceeded' : ''}" title="${badgeTitle}">${badgeText}</span>
        <button class="btn sm col-sort-btn ${colSort.field ? 'active-sort' : ''}" data-colsortgid="${gidStr}" title="Сортировка карточек в колонке: ${esc(sortFieldLabel || 'По умолчанию')}" style="padding:2px 6px;margin-left:auto;font-size:11px;background:var(--bg);border:1px solid var(--line2)">
          ${sortIcon}
        </button>
      </div>
      <div class="kb-body" data-colgid="${gidStr}">${cards || '<div style="color:var(--mut2);font-size:12px;text-align:center;padding:16px">пусто</div>'}</div>
    </div>`;
  }).join('');

  const reRender = () => renderKanbanView(S, ent, mount, callbacks);

  const activeFiltersCount = countActiveViewFilters(kbFilters, S.search);
  const filterBtnHtml = `
    <button class="btn sm ${activeFiltersCount ? 'pri' : ''}" id="btnKbFilters" title="Фильтрация карточек" style="display:inline-flex;align-items:center;gap:4px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>
      Фильтры ${activeFiltersCount ? `(${activeFiltersCount})` : ''}
    </button>
  `;

  const resetBtnHtml = activeFiltersCount > 0 ? `
    <button class="btn sm" id="btnKbResetFilters" title="Сбросить все применённые фильтры и поиск" style="display:inline-flex;align-items:center;gap:6px;background:#FFF5F5;border-color:#FEB2B2;color:#C53030;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>
      Применено фильтров: ${activeFiltersCount}
      <span style="font-weight:800;margin-left:2px;font-size:12px">✕ Сбросить</span>
    </button>
  ` : '';

  mount.innerHTML = `<div class="panel" style="padding:14px;background:transparent;border:none;box-shadow:none">
    <div class="toolbar panel" style="margin-bottom:12px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:12px;color:var(--mut);font-weight:700;letter-spacing:.06em;text-transform:uppercase">Группировка:</span>
      <div class="seg kb-tabs" style="display:inline-flex;gap:3px;align-items:center;flex-wrap:wrap">
        ${stdOpts.map(o => `
          <button data-kb-group="${o[0]}" class="kb-tab-btn ${by === o[0] ? 'on' : ''}">${o[1]}</button>
        `).join('')}
        ${customBoards.map(b => `
          <button data-kb-group="cb_${b.id}" data-board-id="${b.id}" class="kb-tab-btn custom-tab ${by === 'cb_' + b.id ? 'on' : ''}" title="Клик — переключить. ПКМ — контекстное меню">📋 ${esc(b.name)}</button>
        `).join('')}
      </div>
      <button class="btn sm" id="btnCreateBoard" title="Создать новую кастомную доску" style="padding:5px 10px;font-weight:700">➕</button>

      ${activeCustomBoard ? `
        <button class="btn sm" id="btnEditBoard" title="Настройка колонок и метаданных">✏ Настроить</button>
        <button class="btn sm" id="btnAddColumn" title="Быстро добавить колонку">➕ Колонка</button>
        <button class="btn sm err" id="btnDeleteBoard" title="Удалить доску">🗑</button>
      ` : ''}

      ${filterBtnHtml}
      ${resetBtnHtml}

      <div class="sp"></div>
      <button class="btn sm" data-cards>⚙ Поля карточек</button>
    </div>
    <div class="kb">${colsHtml}</div></div>`;

  const newKb = mount.querySelector('.kb');
  if (newKb) {
    newKb.scrollLeft = prevBoardLeft;
    newKb.scrollTop = prevBoardTop;
    newKb.addEventListener('scroll', () => {
      KB_SCROLL_POS[ent] = KB_SCROLL_POS[ent] || { cols: {} };
      KB_SCROLL_POS[ent].boardLeft = newKb.scrollLeft;
      KB_SCROLL_POS[ent].boardTop = newKb.scrollTop;
    }, { passive: true });
  }

  mount.querySelectorAll('.kb-body').forEach(b => {
    const colGid = b.dataset.colgid;
    if (colGid && prevCols[colGid]) {
      b.scrollTop = prevCols[colGid];
    }
    b.addEventListener('scroll', () => {
      KB_SCROLL_POS[ent] = KB_SCROLL_POS[ent] || { cols: {} };
      KB_SCROLL_POS[ent].cols = KB_SCROLL_POS[ent].cols || {};
      KB_SCROLL_POS[ent].cols[colGid] = b.scrollTop;
    }, { passive: true });
  });

  if (prevWindowY > 0 && window.scrollY !== prevWindowY) {
    window.scrollTo(window.scrollX, prevWindowY);
  }

  mount.querySelector('[data-cards]').onclick = () => openCardSettings(S, 'kb', reRender);

  const btnKbFilters = mount.querySelector('#btnKbFilters');
  if (btnKbFilters) {
    btnKbFilters.onclick = (e) => {
      e.stopPropagation();
      openViewFiltersPopover(btnKbFilters, S, ent, 'kb', reRender);
    };
  }

  const btnKbResetFilters = mount.querySelector('#btnKbResetFilters');
  if (btnKbResetFilters) {
    btnKbResetFilters.onclick = async () => {
      await resetViewFilters(S, ent, 'kb');
      reRender();
    };
  }

  mount.querySelectorAll('.kb-tab-btn').forEach(btn => {
    const grpKey = btn.dataset.kbGroup;
    const boardId = btn.dataset.boardId ? +btn.dataset.boardId : null;

    btn.onclick = async () => {
      S.prefs.kanbanGroup[ent] = grpKey;
      await savePrefs(S);
      reRender();
    };

    if (boardId) {
      const boardObj = customBoards.find(b => b.id === boardId);
      if (boardObj) {
        const triggerCtx = (clientX, clientY) => {
          showContextMenu({
            preventDefault: () => {},
            stopPropagation: () => {},
            clientX,
            clientY
          }, [
            {
              label: '✏ Переименовать / Настроить доску',
              action: () => openCustomBoardModal(S, ent, boardObj, reRender)
            },
            {
              label: '➕ Добавить колонку',
              action: () => openAddColumnModal(S, ent, boardObj, reRender)
            },
            {
              label: '🗑 Удалить доску',
              danger: true,
              action: () => {
                confirmBox(`Удалить канбан доску «${boardObj.name}»?`, async () => {
                  try {
                    await db.kanbanBoards.delete(boardObj.id);
                    S.prefs.kanbanGroup[ent] = 'statusId';
                    await savePrefs(S);
                    await refreshAll(S);
                    toast('Доска удалена', 'ok');
                    reRender();
                  } catch (e) {
                    toast('Ошибка удаления доски', 'err');
                  }
                });
              }
            }
          ]);
        };

        btn.oncontextmenu = e => {
          e.preventDefault();
          e.stopPropagation();
          triggerCtx(e.clientX, e.clientY);
        };

        let tTimer = null;
        btn.ontouchstart = e => {
          if (e.touches.length > 1) return;
          const touch = e.touches[0];
          tTimer = setTimeout(() => {
            triggerCtx(touch.clientX, touch.clientY);
          }, 500);
        };
        btn.ontouchend = () => { if (tTimer) clearTimeout(tTimer); };
        btn.ontouchmove = () => { if (tTimer) clearTimeout(tTimer); };
      }
    }
  });

  const btnCreateBoard = mount.querySelector('#btnCreateBoard');
  if (btnCreateBoard) {
    btnCreateBoard.onclick = () => openCustomBoardModal(S, ent, null, reRender);
  }

  const btnEditBoard = mount.querySelector('#btnEditBoard');
  if (btnEditBoard) {
    btnEditBoard.onclick = () => openCustomBoardModal(S, ent, activeCustomBoard, reRender);
  }

  const btnAddColumn = mount.querySelector('#btnAddColumn');
  if (btnAddColumn) {
    btnAddColumn.onclick = () => openAddColumnModal(S, ent, activeCustomBoard, reRender);
  }

  const btnDeleteBoard = mount.querySelector('#btnDeleteBoard');
  if (btnDeleteBoard) {
    btnDeleteBoard.onclick = () => {
      confirmBox(`Удалить канбан доску «${activeCustomBoard.name}»?`, async () => {
        try {
          await db.kanbanBoards.delete(activeCustomBoard.id);
          S.prefs.kanbanGroup[ent] = 'statusId';
          await savePrefs(S);
          await refreshAll(S);
          toast('Доска удалена', 'ok');
          reRender();
        } catch (e) {
          toast('Ошибка удаления доски', 'err');
        }
      });
    };
  }

  // Per-column sort popover
  mount.querySelectorAll('.col-sort-btn').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const colGid = btn.dataset.colsortgid;
      const colKey = `${ent}_${by}_${colGid}`;
      const colSort = S.prefs.kanbanColSort[colKey] || { field: '', dir: 'asc' };

      popover(btn, `
        <div class="pt">Сортировка колонки</div>
        <div style="display:flex;flex-direction:column;gap:4px;max-height:260px;overflow:auto;margin-bottom:8px">
          ${SORT_OPTIONS.map(o => `<label class="pi" style="cursor:pointer;display:flex;align-items:center;gap:8px">
            <input type="radio" name="colkbsort" value="${o.k}" ${colSort.field === o.k ? 'checked' : ''}>
            <span>${o.label}</span>
          </label>`).join('')}
        </div>
        <div style="border-top:1px solid var(--line2);padding-top:8px;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:11px;color:var(--mut)">Порядок:</span>
          <button class="btn sm" id="btnToggleColDir" style="padding:3px 8px">${colSort.dir === 'desc' ? '⬇ По убыванию' : '⬆ По возрастанию'}</button>
        </div>
      `, p => {
        let currentDir = colSort.dir;
        const dirBtn = p.querySelector('#btnToggleColDir');
        if (dirBtn) {
          dirBtn.onclick = async () => {
            currentDir = currentDir === 'asc' ? 'desc' : 'asc';
            dirBtn.textContent = currentDir === 'desc' ? '⬇ По убыванию' : '⬆ По возрастанию';
            S.prefs.kanbanColSort[colKey] = { field: colSort.field, dir: currentDir };
            await savePrefs(S);
            closePop();
            reRender();
          };
        }
        p.querySelectorAll('input[name="colkbsort"]').forEach(input => {
          input.onchange = async () => {
            S.prefs.kanbanColSort[colKey] = { field: input.value, dir: currentDir };
            await savePrefs(S);
            closePop();
            reRender();
          };
        });
      });
    };
  });

  // Cards interaction & Drag/Drop
  mount.querySelectorAll('.kcard').forEach(c => {
    const id = +c.dataset.id;
    c.onclick = () => { if (callbacks.onView) callbacks.onView(ent, id); };
    c.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/kid', id);
      e.dataTransfer.setData('text/fromcolgid', c.dataset.colgid);
      c.classList.add('drag');
    });
    c.addEventListener('dragend', () => {
      c.classList.remove('drag');
      mount.querySelectorAll('.kcard').forEach(card => card.classList.remove('over-card-top', 'over-card-bottom'));
    });

    c.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/kid')) {
        e.preventDefault();
        e.stopPropagation();
        const rect = c.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          c.classList.add('over-card-top');
          c.classList.remove('over-card-bottom');
        } else {
          c.classList.add('over-card-bottom');
          c.classList.remove('over-card-top');
        }
      }
    });

    c.addEventListener('dragleave', () => {
      c.classList.remove('over-card-top', 'over-card-bottom');
    });

    c.addEventListener('drop', async e => {
      if (e.dataTransfer.types.includes('text/kid')) {
        e.preventDefault();
        e.stopPropagation();
        c.classList.remove('over-card-top', 'over-card-bottom');

        const draggedId = +e.dataTransfer.getData('text/kid');
        const targetId = +c.dataset.id;
        const targetColGid = c.dataset.colgid;
        if (!draggedId || draggedId === targetId) return;

        const draggedItem = S[ent].find(x => x.id === draggedId);
        if (!draggedItem) return;

        if (activeCustomBoard) {
          const targetColDef = groups.find(grp => String(grp.id) === targetColGid);
          if (targetColDef && targetColDef.field && targetColDef.val !== undefined && targetColDef.val !== '' && targetColDef.val !== null) {
            let nVal = targetColDef.val;
            if (typeof nVal === 'string' && !isNaN(+nVal)) nVal = +nVal;
            draggedItem[targetColDef.field] = nVal;
            draggedItem.updatedAt = nowIso();
            try { await db[ent].put(draggedItem); } catch (err) { console.error('Error updating item', err); }
          }
        } else {
          const targetGidVal = targetColGid !== '__null' ? +targetColGid : null;
          if ((draggedItem[by] ?? null) !== targetGidVal) {
            draggedItem[by] = targetGidVal;
            draggedItem.updatedAt = nowIso();
            try { await db[ent].put(draggedItem); } catch (err) { console.error('Error updating item group', err); }
          }
        }

        // Reorder cards in target column
        const targetColKey = `${ent}_${by}_${targetColGid}`;
        let colCards = (S.prefs.kanbanCardOrder[targetColKey] || []).filter(x => x !== draggedId);

        if (!colCards.length) {
          const targetGidVal = targetColGid !== '__null' ? +targetColGid : null;
          const colItems = S[ent].filter(r => matchSearch(S, coldefs, ent, r) && (r[by] ?? null) === targetGidVal);
          colCards = colItems.map(x => x.id).filter(x => x !== draggedId);
        }

        const rect = c.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const targetIdx = colCards.indexOf(targetId);
        const insertIdx = e.clientY < midY ? Math.max(0, targetIdx) : targetIdx + 1;

        if (targetIdx !== -1) {
          colCards.splice(insertIdx, 0, draggedId);
        } else {
          colCards.push(draggedId);
        }

        S.prefs.kanbanCardOrder[targetColKey] = colCards;
        await savePrefs(S);
        await refreshAll(S);
        await afterChange(S);
        toast('Порядок карточек обновлен', 'ok');
        reRender();
      }
    });

    const triggerCtx = (clientX, clientY) => {
      const items = getCommonContextMenuItems(S, ent, id, callbacks, reRender);
      showContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX,
        clientY
      }, items);
    };

    c.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      triggerCtx(e.clientX, e.clientY);
    };

    let touchTimer = null;
    c.ontouchstart = e => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      touchTimer = setTimeout(() => {
        triggerCtx(touch.clientX, touch.clientY);
      }, 500);
    };
    c.ontouchend = () => { if (touchTimer) clearTimeout(touchTimer); };
    c.ontouchmove = () => { if (touchTimer) clearTimeout(touchTimer); };
  });

  // Columns Drag & Drop + Column level drop target
  mount.querySelectorAll('.kb-col').forEach(colEl => {
    const colHeader = colEl.querySelector('.kb-h');
    if (colHeader) {
      colHeader.addEventListener('dragstart', e => {
        const colGid = colHeader.dataset.colgid;
        e.dataTransfer.setData('text/colgid', colGid);
        colEl.classList.add('dragging-col');
      });
      colHeader.addEventListener('dragend', () => {
        colEl.classList.remove('dragging-col');
      });
    }

    colEl.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/colgid')) {
        e.preventDefault();
        colEl.classList.add('over-col');
      } else if (e.dataTransfer.types.includes('text/kid')) {
        e.preventDefault();
        colEl.classList.add('over');
      }
    });

    colEl.addEventListener('dragleave', () => {
      colEl.classList.remove('over-col');
      colEl.classList.remove('over');
    });

    colEl.addEventListener('drop', async e => {
      e.preventDefault();
      colEl.classList.remove('over-col');
      colEl.classList.remove('over');

      const fromColGid = e.dataTransfer.getData('text/colgid');
      if (fromColGid) {
        const toColGid = colEl.dataset.gid;
        if (fromColGid !== toColGid) {
          let curOrder = groups.map(grp => String(grp.id ?? '__null'));
          const fromIdx = curOrder.indexOf(fromColGid);
          const toIdx = curOrder.indexOf(toColGid);
          if (fromIdx !== -1 && toIdx !== -1) {
            curOrder.splice(fromIdx, 1);
            curOrder.splice(toIdx, 0, fromColGid);
            S.prefs.kanbanColOrder = S.prefs.kanbanColOrder || {};
            S.prefs.kanbanColOrder[colOrderKey] = curOrder;
            await savePrefs(S);
            toast('Порядок колонок обновлен', 'ok');
            reRender();
          }
        }
        return;
      }

      const id = +e.dataTransfer.getData('text/kid');
      if (!id) return;
      const r = S[ent].find(x => x.id === id);
      if (!r) return;
      const targetGid = colEl.dataset.gid;

      const oldStageId = ent === 'projects' ? r.stageId : null;
      const oldProgress = ent === 'projects' ? (r.stageProgress || {}) : {};

      if (activeCustomBoard) {
        const targetColDef = groups.find(grp => String(grp.id) === targetGid);
        if (targetColDef && targetColDef.field && targetColDef.val !== undefined && targetColDef.val !== '' && targetColDef.val !== null) {
          let nVal = targetColDef.val;
          if (typeof nVal === 'string' && !isNaN(+nVal)) nVal = +nVal;
          r[targetColDef.field] = nVal;
          r.updatedAt = nowIso();
        }
      } else {
        const gidVal = targetGid !== '__null' ? +targetGid : null;
        r[by] = gidVal;
        r.updatedAt = nowIso();
      }

      const targetColKey = `${ent}_${by}_${targetGid}`;
      let colCards = (S.prefs.kanbanCardOrder[targetColKey] || []).filter(x => x !== id);
      colCards.push(id);
      S.prefs.kanbanCardOrder[targetColKey] = colCards;

      try {
        await db[ent].put(r);

        // Record stage history if project stage changed
        if (ent === 'projects' && r.stageId && r.stageId !== oldStageId) {
          await db.stageHistory.add({
            projectId: r.id,
            ts: nowIso(),
            stageId: r.stageId,
            from: oldProgress[oldStageId] || 0,
            to: (r.stageProgress && r.stageProgress[r.stageId]) || 0
          });
        }

        await savePrefs(S);
        await refreshAll(S);
        await afterChange(S);
        toast(`«${r.name}» перемещен(а)`, 'ok');
        reRender();
      } catch (err) {
        setDbBeacon('error', '🔴 Ошибка базы данных');
        toast('Ошибка записи: ' + err.message, 'err');
      }
    });
  });
}

// src/services/quickActions.js
import { nowIso } from '../utils/date.js';
import { modal } from '../ui/modal.js';
import { db, refreshAll } from '../core/db.js';
import { setDbBeacon, afterChange } from '../utils/logger.js';
import { toast } from '../ui/toast.js';
import { esc } from '../utils/dom.js';
import { openProjectForm } from '../pages/forms/ProjectForm.js';
import { openTaskForm } from '../pages/forms/TaskForm.js';
import { openChangeForm } from '../pages/forms/ChangeForm.js';
import { openDirForm } from '../pages/forms/DirForm.js';
import { renderColorOptions, setupColorSelects } from '../utils/colorSelect.js';
import { openMergeModal, openSplitModal } from './entityMergeSplit.js';

export function duplicateRecord(S, ent, id, autoSave) {
  const item = (S[ent] || []).find(x => x.id === id);
  if (!item) {
    toast('Запись не найдена', 'err');
    return null;
  }

  const copy = JSON.parse(JSON.stringify(item));
  delete copy.id;
  copy.name = `${copy.name} (копия)`;
  copy.isDuplicate = true;

  if (ent === 'projects') {
    openProjectForm(S, null, copy, autoSave);
  } else if (ent === 'tasks') {
    openTaskForm(S, null, copy, autoSave);
  } else if (ent === 'changes') {
    openChangeForm(S, null, copy, autoSave);
  } else {
    openDirForm(S, ent, null, copy, autoSave);
  }
  return null;
}

export function openQuickChangeModal(S, ent, id, callbacks = {}) {
  const list = S[ent] || [];
  const r = list.find(x => x.id === id);
  if (!r) return;

  const isMain = ['projects', 'tasks', 'changes'].includes(ent);
  const isEmp = ent === 'employees';
  const isStatus = ent === 'projectStatuses' || ent === 'taskStatuses';
  const isPriority = ent === 'priorities';
  const isStage = ent === 'stages';

  const statuses = ent === 'projects' ? S.projectStatuses : S.taskStatuses;
  const devsList = S.employees.filter(e => e.role === 'dev' && (e.active !== false && e.active !== 0 || e.id === r.devId)) || [];
  const agentsList = S.employees.filter(e => e.role === 'agent' && (e.active !== false && e.active !== 0 || e.id === r.agentId)) || [];

  let body = '<form id="quickForm" class="fgrid">';

  if (isMain) {
    const hasStage = ent === 'projects';
    body += `
      <div><label class="fl">Статус</label><select name="statusId">${renderColorOptions(statuses, r.statusId)}</select></div>
      <div><label class="fl">Приоритет</label><select name="priorityId">${renderColorOptions(S.priorities, r.priorityId)}</select></div>
      ${hasStage ? `<div><label class="fl">Текущий этап</label><select name="stageId">${renderColorOptions(S.stages, r.stageId, '— Не выбран —')}</select></div>` : ''}
      <div><label class="fl">Ответственный разработчик</label><select name="devId">${renderColorOptions(devsList, r.devId, '— Не назначен —')}</select></div>
      <div><label class="fl">Ответственный агент</label><select name="agentId">${renderColorOptions(agentsList, r.agentId, '— Не назначен —')}</select></div>
      ${hasStage ? `<div class="full"><label class="fl">Прогресс по этапам (%)</label>
        <div class="stageed">${S.stages.map(st => {
          const val = r.stageProgress ? (r.stageProgress[st.id] || 0) : 0;
          return `<div class="sr"><span>${esc(st.name)}</span><input type="range" min="0" max="100" data-sp="${st.id}" value="${val}"><span class="pv" id="qspv-${st.id}">${val}%</span></div>`;
        }).join('') || '<div>Этапы не заведены</div>'}</div>
      </div>` : ''}
    `;
  } else if (isEmp) {
    body += `
      <div><label class="fl">Роль</label><select name="role">
        <option value="dev" ${r.role === 'dev' ? 'selected' : ''}>Разработчик</option>
        <option value="agent" ${r.role === 'agent' ? 'selected' : ''}>Агент (ПМ / Аналитик)</option>
      </select></div>
      <div><label class="fl">Статус активности</label><select name="active">
        <option value="1" ${r.active !== false && r.active !== 0 ? 'selected' : ''}>● Активен</option>
        <option value="0" ${r.active === false || r.active === 0 ? 'selected' : ''}>○ Неактивен</option>
      </select></div>
      <div><label class="fl">Цвет плашки</label><input type="color" name="color" value="${r.color || '#2B6CB0'}" style="height:38px;padding:2px;cursor:pointer;width:100%"></div>
      <div class="full"><label class="fl">Должность / Специализация</label><input type="text" name="position" value="${esc(r.position || '')}"></div>
    `;
  } else if (isStatus || isPriority || isStage) {
    body += `
      <div class="full"><label class="fl">Название</label><input type="text" name="name" value="${esc(r.name || '')}"></div>
      <div><label class="fl">Цвет</label><input type="color" name="color" value="${r.color || '#2B6CB0'}" style="height:38px;padding:2px;cursor:pointer;width:100%"></div>
      ${isPriority ? `<div><label class="fl">Вес (приоритет)</label><input type="number" name="weight" value="${r.weight || 0}"></div>` : ''}
    `;
  } else {
    body += `<div class="full"><label class="fl">Название</label><input type="text" name="name" value="${esc(r.name || '')}"></div>`;
  }

  body += '</form>';

  modal({
    title: `Быстрая смена параметров`,
    sub: r.num ? `${r.num} · ${r.name}` : r.name,
    wide: false,
    body,
    foot: `<button class="btn" data-x>Отмена</button><button class="btn pri" data-save>Сохранить</button>`,
    mount(box) {
      setupColorSelects(box.el);
      const stageSel = box.el.querySelector('select[name="stageId"]');
      box.el.querySelectorAll('input[data-sp]').forEach(rng => rng.oninput = () => {
        const pv = box.el.querySelector('#qspv-' + rng.dataset.sp);
        if (pv) pv.textContent = rng.value + '%';

        if (+rng.value === 100 && stageSel && S.stages && S.stages.length) {
          const spId = +rng.dataset.sp;
          if (!stageSel.value || +stageSel.value === spId) {
            const idx = S.stages.findIndex(st => st.id === spId);
            if (idx !== -1 && idx < S.stages.length - 1) {
              const nextSt = S.stages[idx + 1];
              stageSel.value = nextSt.id;
              toast(`Этап «${S.stages[idx].name}» выполнен на 100%. Проект переведен на следующий этап «${nextSt.name}»`, 'ok');
            }
          }
        }
      });

      box.el.querySelector('[data-x]').onclick = () => box.close();
      box.el.querySelector('[data-save]').onclick = async () => {
        const form = box.el.querySelector('#quickForm');
        const fd = new FormData(form);

        const oldStageId = ent === 'projects' ? r.stageId : null;
        const oldProgress = ent === 'projects' ? JSON.parse(JSON.stringify(r.stageProgress || {})) : {};

        if (isMain) {
          if (fd.get('statusId')) r.statusId = +fd.get('statusId');
          if (fd.get('priorityId')) r.priorityId = +fd.get('priorityId');
          if (ent === 'projects') r.stageId = +fd.get('stageId') || null;
          r.devId = +fd.get('devId') || null;
          r.agentId = +fd.get('agentId') || null;

          if (ent === 'projects') {
            r.stageProgress = r.stageProgress || {};
            box.el.querySelectorAll('input[data-sp]').forEach(rng => {
              r.stageProgress[rng.dataset.sp] = +rng.value;
            });
          }
        } else if (isEmp) {
          r.role = fd.get('role');
          r.active = fd.get('active') === '1';
          r.color = fd.get('color');
          r.position = fd.get('position');
        } else if (isStatus || isPriority || isStage) {
          if (fd.get('name')) r.name = fd.get('name');
          if (fd.get('color')) r.color = fd.get('color');
          if (isPriority && fd.get('weight') !== null) r.weight = +fd.get('weight');
        } else {
          if (fd.get('name')) r.name = fd.get('name');
        }

        r.updatedAt = nowIso();

        try {
          await db[ent].put(r);

          if (ent === 'projects') {
            if (r.stageId !== oldStageId) {
              const fromProg = oldProgress[oldStageId] || 0;
              const toProg = (r.stageProgress && r.stageProgress[r.stageId]) || 0;
              await db.stageHistory.add({
                projectId: r.id,
                ts: nowIso(),
                stageId: r.stageId,
                from: fromProg,
                to: toProg
              });
            } else {
              for (const st of (S.stages || [])) {
                const oldVal = oldProgress[st.id] || 0;
                const newVal = (r.stageProgress && r.stageProgress[st.id]) || 0;
                if (oldVal !== newVal) {
                  await db.stageHistory.add({
                    projectId: r.id,
                    ts: nowIso(),
                    stageId: st.id,
                    from: oldVal,
                    to: newVal
                  });
                }
              }
            }
          }

          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);
          toast(`Параметры «${r.name}» обновлены`, 'ok');
          box.close();
          if (callbacks.onSuccess) callbacks.onSuccess();
        } catch (err) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка записи: ' + err.message, 'err');
        }
      };
    }
  });
}

export function createSubItem(S, parentEnt, parentId, targetEnt, callbacks = {}) {
  if (parentEnt === 'projects' && targetEnt === 'tasks') {
    openTaskForm(S, null, { projectId: parentId }, callbacks.autoSave);
  } else if (parentEnt === 'tasks' && targetEnt === 'changes') {
    openChangeForm(S, null, { taskId: parentId }, callbacks.autoSave);
  }
}

export function openAddNoteModal(S, ent, id, callbacks = {}, reRender = null) {
  const item = (S[ent] || []).find(x => x.id === id);
  if (!item) return;

  const itemTitle = item.num ? `${item.num} · ${item.name}` : item.name;

  modal({
    title: 'Добавить заметку',
    sub: `ЗАПИСЬ: ${esc(itemTitle)}`,
    body: `
      <div style="display:flex;flex-direction:column;gap:10px">
        <label style="font-size:12.5px;font-weight:700;color:var(--ink)">Текст заметки</label>
        <textarea id="quickNoteText" class="ipt" placeholder="Введите текст заметки... (Ctrl+Enter для сохранения)" rows="4" style="width:100%;resize:vertical;font-size:13px;line-height:1.45"></textarea>
        <span class="mono" style="font-size:11px;color:var(--mut)">Заметка будет сохранена в истории и отобразится в поле «Последняя заметка»</span>
      </div>
    `,
    foot: `
      <button class="btn" data-cancel>Отмена</button>
      <button class="btn pri" id="btnSaveQuickNote" style="font-weight:700">Добавить заметку</button>
    `,
    mount(box) {
      const tx = box.el.querySelector('#quickNoteText');
      if (tx) tx.focus();

      box.el.querySelector('[data-cancel]').onclick = () => box.close();

      const save = async () => {
        const text = tx.value.trim();
        if (!text) {
          toast('Введите текст заметки', 'warn');
          return;
        }

        item.notes = item.notes || [];
        const newNote = {
          id: 'not_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          text,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        item.notes.push(newNote);
        item.note = text;
        item.updatedAt = nowIso();

        try {
          await db[ent].put(item);
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);
          toast('Заметка успешно сохранена', 'ok');
          box.close();
          if (reRender) reRender();
          else if (callbacks.onRefreshPage) callbacks.onRefreshPage();
        } catch (err) {
          toast('Ошибка сохранения: ' + err.message, 'err');
        }
      };

      box.el.querySelector('#btnSaveQuickNote').onclick = save;
      if (tx) {
        tx.onkeydown = e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
          }
        };
      }
    }
  });
}

export function openAddChecklistItemModal(S, ent, id, callbacks = {}, reRender = null) {
  const item = (S[ent] || []).find(x => x.id === id);
  if (!item) return;

  const itemTitle = item.num ? `${item.num} · ${item.name}` : item.name;

  modal({
    title: 'Добавить пункт в чек-лист',
    sub: `ЗАПИСЬ: ${esc(itemTitle)}`,
    body: `
      <div style="display:flex;flex-direction:column;gap:10px">
        <label style="font-size:12.5px;font-weight:700;color:var(--ink)">Текст пункта чек-листа</label>
        <input type="text" id="quickChecklistText" class="ipt" placeholder="Например: Проверить интеграцию с API..." style="width:100%;font-size:13px">
      </div>
    `,
    foot: `
      <button class="btn" data-cancel>Отмена</button>
      <button class="btn pri" id="btnSaveQuickChk" style="font-weight:700">Добавить пункт</button>
    `,
    mount(box) {
      const inp = box.el.querySelector('#quickChecklistText');
      if (inp) inp.focus();

      box.el.querySelector('[data-cancel]').onclick = () => box.close();

      const save = async () => {
        const text = inp.value.trim();
        if (!text) {
          toast('Введите текст пункта', 'warn');
          return;
        }

        item.checklists = item.checklists || [];
        const newChk = {
          id: 'chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          text,
          done: false,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        item.checklists.push(newChk);
        item.updatedAt = nowIso();

        try {
          await db[ent].put(item);
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);
          toast('Пункт чек-листа добавлен', 'ok');
          box.close();
          if (reRender) reRender();
          else if (callbacks.onRefreshPage) callbacks.onRefreshPage();
        } catch (err) {
          toast('Ошибка сохранения: ' + err.message, 'err');
        }
      };

      box.el.querySelector('#btnSaveQuickChk').onclick = save;
      if (inp) {
        inp.onkeydown = e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            save();
          }
        };
      }
    }
  });
}

export function getCommonContextMenuItems(S, ent, id, callbacks = {}, reRender, extra = {}) {
  const item = (S[ent] || []).find(x => x.id === id);
  if (!item) return [];

  // Special streamlined context menu for auditLogs (no edit/duplicate/merge)
  if (ent === 'auditLogs') {
    return [
      {
        id: 'view',
        label: 'Просмотреть детали записи',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
        action: () => { if (callbacks.onView) callbacks.onView(ent, id); }
      },
      {
        id: 'copyName',
        label: 'Скопировать описание',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        action: () => {
          const txt = `[${item.ts || ''}] ${item.action || ''} ${item.entity || ''} (${item.target || ''}) - ${item.field || ''}`;
          navigator.clipboard.writeText(txt);
          toast('Скопировано в буфер обмена', 'ok');
        }
      },
      { type: 'divider' },
      {
        id: 'delete',
        label: 'Удалить из журнала',
        danger: true,
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
        action: () => {
          if (callbacks.onDelete) {
            callbacks.onDelete(ent, id);
          }
        }
      }
    ];
  }

  const items = [
    {
      id: 'view',
      label: 'Просмотреть запись',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
      action: () => { if (callbacks.onView) callbacks.onView(ent, id); }
    },
    {
      id: 'edit',
      label: 'Редактировать',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
      action: () => {
        if (['projects', 'tasks', 'changes'].includes(ent)) {
          if (callbacks.onEdit) callbacks.onEdit(ent, id);
        } else {
          if (callbacks.onEditDir) callbacks.onEditDir(ent, id);
        }
      }
    },
    {
      id: 'quickParams',
      label: 'Параметры',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
      action: () => {
        openQuickChangeModal(S, ent, id, {
          autoSave: callbacks.autoSave,
          onSuccess: () => { if (reRender) reRender(); }
        });
      }
    },
    {
      id: 'duplicate',
      label: 'Дублировать',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      action: () => {
        duplicateRecord(S, ent, id, callbacks.autoSave);
      }
    }
  ];

  const isMain = ['projects', 'tasks', 'changes'].includes(ent);
  const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };

  // Context actions for Notes and Checklists
  if (isMain) {
    items.push(
      { type: 'divider' },
      {
        id: 'addNote',
        label: 'Добавить в Заметку...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        action: () => openAddNoteModal(S, ent, id, callbacks, reRender)
      },
      {
        id: 'addChecklist',
        label: 'Добавить в Чеклист...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        action: () => openAddChecklistItemModal(S, ent, id, callbacks, reRender)
      }
    );
  }

  // Smart Merge & Split for Projects, Tasks, and Changes
  if (isMain) {
    const selCount = extra.selectedIds && extra.selectedIds.length > 1 ? extra.selectedIds.length : 0;
    items.push(
      { type: 'divider' },
      {
        id: 'merge',
        label: selCount ? `Объединить выбранные (${selCount})...` : 'Объединить с другими...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M4 18V4a2 2 0 0 1 2-2h14"/></svg>',
        action: () => {
          const sIds = selCount ? extra.selectedIds : [id];
          openMergeModal(S, ent, id, sIds, {
            autoSave: callbacks.autoSave,
            onRefreshPage: () => { if (reRender) reRender(); else if (callbacks.onRefreshPage) callbacks.onRefreshPage(); }
          });
        }
      },
      {
        id: 'split',
        label: 'Разделить запись...',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
        action: () => {
          openSplitModal(S, ent, id, {
            autoSave: callbacks.autoSave,
            onRefreshPage: () => { if (reRender) reRender(); else if (callbacks.onRefreshPage) callbacks.onRefreshPage(); }
          });
        }
      }
    );
  }

  if (ent === 'projects' && mods.tasks) {
    items.push({
      id: 'addTask',
      label: 'Создать задачу к проекту',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
      action: () => createSubItem(S, 'projects', id, 'tasks', callbacks)
    });
  } else if (ent === 'tasks' && mods.changes) {
    items.push({
      id: 'addChange',
      label: 'Создать изменение к задаче',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
      action: () => createSubItem(S, 'tasks', id, 'changes', callbacks)
    });
  }

  items.push(
    { type: 'divider' },
    {
      id: 'copyName',
      label: 'Скопировать название/код',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
      action: () => {
        const codeOrName = item.num ? `${item.num} · ${item.name}` : item.name;
        navigator.clipboard.writeText(codeOrName);
        toast(`Скопировано: ${codeOrName}`, 'ok');
      }
    },
    {
      id: 'delete',
      label: 'Удалить',
      danger: true,
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>',
      action: () => {
        if (callbacks.onDelete) {
          callbacks.onDelete(ent, id);
        }
      }
    }
  );

  return items;
}

// src/services/entityMergeSplit.js
import { esc } from '../utils/dom.js';
import { fmtD, nowIso } from '../utils/date.js';
import { colorOf } from '../utils/color.js';
import { modal, confirmBox } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { db, refreshAll } from '../core/db.js';
import { setDbBeacon, afterChange } from '../utils/logger.js';
import { statFor, pri, emp, prj, tsk, stg } from './refs.js';
import { renderColorOptions, setupColorSelects } from '../utils/colorSelect.js';

const ENT_NAMES = {
  projects: { ru: 'Проект', plur: 'Проектов', plurGen: 'проектов', child: 'tasks', childRu: 'Задачи', childGen: 'задач' },
  tasks: { ru: 'Задача', plur: 'Задач', plurGen: 'задач', child: 'changes', childRu: 'Изменения', childGen: 'изменений' },
  changes: { ru: 'Изменение', plur: 'Изменений', plurGen: 'изменений', child: null, childRu: '', childGen: '' }
};

/**
 * Open Smart Merge Modal for 2+ entities
 */
export function openMergeModal(S, ent, initialId, selectedIds = [], callbacks = {}) {
  let targetIds = Array.isArray(selectedIds) && selectedIds.length >= 2
    ? [...selectedIds]
    : [initialId].filter(Boolean);

  const entMeta = ENT_NAMES[ent] || ENT_NAMES.projects;
  const allItems = S[ent] || [];

  let masterId = targetIds[0] || initialId;
  let customSearch = '';
  let mergeDuplicatesToggle = true;

  // Stored form draft to preserve user edits across re-renders
  let formDraft = null;

  const renderModalContent = (box) => {
    // Capture current form state if form exists
    const existingForm = box.el.querySelector('#mergeConflictForm');
    if (existingForm) {
      const curFd = new FormData(existingForm);
      formDraft = {
        num: curFd.get('finalNum'),
        name: curFd.get('finalName'),
        desc: curFd.get('finalDesc'),
        note: curFd.get('finalNote'),
        statusId: curFd.get('statusId') ? +curFd.get('statusId') : null,
        priorityId: curFd.get('priorityId') ? +curFd.get('priorityId') : null,
        customerId: curFd.get('customerId') ? +curFd.get('customerId') : null,
        devId: curFd.get('devId') ? +curFd.get('devId') : null,
        agentId: curFd.get('agentId') ? +curFd.get('agentId') : null,
        start: curFd.get('finalStart') || '',
        end: curFd.get('finalEnd') || '',
        stageId: curFd.get('stageId') ? +curFd.get('stageId') : null,
        projectId: curFd.get('projectId') ? +curFd.get('projectId') : null,
        taskId: curFd.get('taskId') ? +curFd.get('taskId') : null,
        stageProgressStrategy: curFd.get('stageProgressStrategy') || 'master',
        devs: Array.from(box.el.querySelectorAll('input[name="mergedDevs"]:checked')).map(i => +i.value),
        agents: Array.from(box.el.querySelectorAll('input[name="mergedAgents"]:checked')).map(i => +i.value)
      };
    }

    const mergeItems = allItems.filter(x => targetIds.includes(x.id));
    if (!mergeItems.some(x => x.id === masterId) && mergeItems.length > 0) {
      masterId = mergeItems[0].id;
    }
    const masterItem = mergeItems.find(x => x.id === masterId) || mergeItems[0] || {};

    // Available items to add to merge
    const availableItems = allItems.filter(x => !targetIds.includes(x.id) && (
      !customSearch || (x.name + ' ' + (x.num || '')).toLowerCase().includes(customSearch.toLowerCase())
    ));

    // Calculate smart merged defaults if no user draft
    const combinedNames = mergeItems.map(x => x.name).filter(Boolean);
    const defaultMergedName = masterItem.name || combinedNames.join(' + ');

    const combinedDescs = mergeItems.map(x => x.desc).filter(Boolean);
    const defaultMergedDesc = masterItem.desc || combinedDescs.join('\n\n');

    const combinedNotes = mergeItems.map(x => x.note).filter(Boolean);
    const defaultMergedNote = masterItem.note || combinedNotes.join('\n\n');

    const allStarts = mergeItems.map(x => x.start).filter(Boolean);
    const minStart = allStarts.length ? allStarts.reduce((min, cur) => cur < min ? cur : min) : (masterItem.start || '');

    const allEnds = mergeItems.map(x => x.end).filter(Boolean);
    const maxEnd = allEnds.length ? allEnds.reduce((max, cur) => cur > max ? cur : max) : (masterItem.end || '');

    const allAgentsUnion = Array.from(new Set(mergeItems.flatMap(x => x.agents || [])));
    const allDevsUnion = Array.from(new Set(mergeItems.flatMap(x => x.devs || [])));

    // Determine current values (prefer draft if available)
    const curNum = formDraft?.num ?? (masterItem.num || '');
    const curName = formDraft?.name ?? defaultMergedName;
    const curDesc = formDraft?.desc ?? defaultMergedDesc;
    const curNote = formDraft?.note ?? defaultMergedNote;
    const curStatusId = formDraft?.statusId ?? masterItem.statusId;
    const curPriorityId = formDraft?.priorityId ?? masterItem.priorityId;
    const curCustomerId = formDraft?.customerId ?? masterItem.customerId;
    const curDevId = formDraft?.devId ?? masterItem.devId;
    const curAgentId = formDraft?.agentId ?? masterItem.agentId;
    const curStart = formDraft?.start ?? minStart;
    const curEnd = formDraft?.end ?? maxEnd;
    const curStageId = formDraft?.stageId ?? masterItem.stageId;
    const curProjectId = formDraft?.projectId ?? masterItem.projectId;
    const curTaskId = formDraft?.taskId ?? masterItem.taskId;
    const curStageStrategy = formDraft?.stageProgressStrategy ?? 'master';
    const curDevs = formDraft?.devs ?? allDevsUnion;
    const curAgents = formDraft?.agents ?? allAgentsUnion;

    // Child items (tasks for projects, changes for tasks)
    let childItems = [];
    if (ent === 'projects') {
      childItems = (S.tasks || []).filter(t => targetIds.includes(t.projectId));
    } else if (ent === 'tasks') {
      childItems = (S.changes || []).filter(c => targetIds.includes(c.taskId));
    }

    // Check for duplicate child names
    const childNamesCount = {};
    childItems.forEach(c => {
      const cleanName = (c.name || '').trim().toLowerCase();
      childNamesCount[cleanName] = (childNamesCount[cleanName] || 0) + 1;
    });
    const hasDuplicateChildren = Object.values(childNamesCount).some(cnt => cnt > 1);

    const statuses = ent === 'projects' ? S.projectStatuses : S.taskStatuses;
    const devsList = S.employees.filter(e => e.role === 'dev') || [];
    const agentsList = S.employees.filter(e => e.role === 'agent') || [];

    const isSingleSelection = mergeItems.length < 2;

    const html = `
      <div class="merge-modal-container" style="display:flex;flex-direction:column;gap:16px">

        <!-- Header / Selected Records Bar -->
        <div style="background:#F8FAFC;padding:14px 16px;border-radius:10px;border:1px solid var(--line2)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <span style="font-size:12.5px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.06em">
              Объединяемые ${entMeta.plurGen} (${mergeItems.length} шт.):
            </span>
            <span style="font-size:11.5px;color:var(--mut)">
              ${isSingleSelection
                ? '⚠️ Для объединения добавьте еще хотя бы одну запись из списка ниже'
                : 'Выберите главную запись (её ID и номер сохранятся, остальные будут удалены)'}
            </span>
          </div>

          <div class="merge-records-grid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:10px">
            ${mergeItems.map((it, idx) => {
              const isMaster = it.id === masterId;
              const st = statFor(S, ent, it.statusId);
              return `
                <div class="merge-record-card ${isMaster ? 'is-master' : ''}" data-pick-master="${it.id}" style="
                  padding:10px 12px;border-radius:8px;border:2px solid ${isMaster ? 'var(--acc)' : 'var(--line2)'};
                  background:${isMaster ? '#EBF8FA' : '#fff'};cursor:pointer;position:relative;transition:all .15s ease">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                    <input type="radio" name="masterPick" value="${it.id}" ${isMaster ? 'checked' : ''} style="cursor:pointer">
                    <b class="mono" style="font-size:12px;color:${isMaster ? 'var(--acc)' : 'var(--ink)'}">${esc(it.num || 'Без номера')}</b>
                    ${isMaster ? `<span class="chip" style="background:var(--acc);color:#fff;font-size:9.5px;padding:1px 5px;font-weight:700">ГЛАВНАЯ (#${idx + 1})</span>` : `<span style="font-size:10px;color:var(--mut)">#${idx + 1}</span>`}
                    ${mergeItems.length > 1 ? `<button class="btn sm err btn-remove-merge" data-remove-id="${it.id}" title="Исключить из объединения" style="margin-left:auto;padding:1px 6px;font-size:11px">✕</button>` : ''}
                  </div>
                  <div style="font-size:12.5px;font-weight:600;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(it.name)}">${esc(it.name)}</div>
                  <div style="font-size:11px;color:var(--mut);display:flex;gap:6px;align-items:center">
                    ${st ? `<span class="dot" style="background:${colorOf(st)}"></span><span>${esc(st.name)}</span>` : ''}
                    ${it.start ? `<span class="mono">📅 ${fmtD(it.start)}</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <!-- Add more items dropdown / search -->
          ${availableItems.length > 0 ? `
            <div style="margin-top:12px;display:flex;align-items:center;gap:8px">
              <input type="text" id="mergeSearchInp" placeholder="🔍 Найти еще ${entMeta.plurGen} для добавления…" value="${esc(customSearch)}" style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--line);flex:1">
              <select id="mergeAddSelect" style="font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid var(--line);max-width:320px">
                <option value="">➕ Добавить запись к объединению…</option>
                ${availableItems.slice(0, 40).map(x => `<option value="${x.id}">${x.num ? esc(x.num) + ' · ' : ''}${esc(x.name)}</option>`).join('')}
              </select>
            </div>
          ` : ''}
        </div>

        <!-- Conflict Resolution Form -->
        <div style="background:#fff;border-radius:10px;border:1px solid var(--line2);padding:16px">
          <h3 style="font-size:14px;margin-bottom:12px;color:var(--ink);display:flex;align-items:center;gap:6px">
            <span>⚙️ Параметры и разрешение конфликтов</span>
          </h3>

          <form id="mergeConflictForm" class="fgrid">
            <!-- Final Number -->
            <div>
              <label class="fl">Итоговый номер / Код</label>
              <input type="text" name="finalNum" value="${esc(curNum)}" required class="mono" style="font-weight:700">
            </div>

            <!-- Customer -->
            <div>
              <label class="fl">Заказчик</label>
              <select name="customerId">${renderColorOptions(S.customers || [], curCustomerId, '— Не выбран —')}</select>
            </div>

            <!-- Name with quick join buttons -->
            <div class="full">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <label class="fl" style="margin:0">Итоговое название</label>
                <div style="display:flex;gap:4px">
                  ${mergeItems.map((x, i) => `<button type="button" class="btn sm btn-fill-name" data-val="${esc(x.name)}" style="font-size:10.5px;padding:2px 6px">Из #${i + 1}</button>`).join('')}
                  <button type="button" class="btn sm pri btn-join-names" style="font-size:10.5px;padding:2px 6px">🔗 Склеить все</button>
                </div>
              </div>
              <input type="text" name="finalName" id="finalNameInp" value="${esc(curName)}" required>
            </div>

            <!-- Status & Priority -->
            <div>
              <label class="fl">Итоговый статус</label>
              <select name="statusId">${renderColorOptions(statuses, curStatusId)}</select>
            </div>
            <div>
              <label class="fl">Итоговый приоритет</label>
              <select name="priorityId">${renderColorOptions(S.priorities, curPriorityId)}</select>
            </div>

            <!-- Dev & Agent -->
            <div>
              <label class="fl">Ответственный разработчик</label>
              <select name="devId">${renderColorOptions(devsList, curDevId, '— Не назначен —')}</select>
            </div>
            <div>
              <label class="fl">Ответственный агент</label>
              <select name="agentId">${renderColorOptions(agentsList, curAgentId, '— Не назначен —')}</select>
            </div>

            <!-- Dates (min start -> max end) -->
            <div>
              <label class="fl">Дата начала (авто: самая ранняя)</label>
              <input type="date" name="finalStart" value="${curStart}">
            </div>
            <div>
              <label class="fl">Дата окончания (авто: самая поздняя)</label>
              <input type="date" name="finalEnd" value="${curEnd}">
            </div>

            <!-- Stage (for projects) -->
            ${ent === 'projects' ? `
              <div>
                <label class="fl">Текущий этап</label>
                <select name="stageId">${renderColorOptions(S.stages || [], curStageId, '— Не выбран —')}</select>
              </div>
              <div>
                <label class="fl">Прогресс этапов</label>
                <select name="stageProgressStrategy">
                  <option value="master" ${curStageStrategy === 'master' ? 'selected' : ''}>Сохранить прогресс главной записи</option>
                  <option value="average" ${curStageStrategy === 'average' ? 'selected' : ''}>Усреднить прогресс всех записей</option>
                  <option value="max" ${curStageStrategy === 'max' ? 'selected' : ''}>Взять максимальный прогресс по каждому этапу</option>
                </select>
              </div>
            ` : ''}

            <!-- Parent reference (for tasks / changes) -->
            ${ent === 'tasks' ? `
              <div class="full">
                <label class="fl">Проект</label>
                <select name="projectId">${renderColorOptions(S.projects || [], curProjectId, '— Без проекта —')}</select>
              </div>
            ` : ''}
            ${ent === 'changes' ? `
              <div class="full">
                <label class="fl">Задача</label>
                <select name="taskId">${renderColorOptions(S.tasks || [], curTaskId, '— Без задачи —')}</select>
              </div>
            ` : ''}

            <!-- Multi-participants (Agents & Devs union) -->
            <div>
              <label class="fl">Участники-разработчики (выбрано: ${curDevs.length})</label>
              <div style="max-height:110px;overflow:auto;padding:6px 10px;border:1px solid var(--line2);border-radius:6px;background:#FAFAFA">
                ${devsList.map(e => `
                  <label class="cb" style="font-size:12px;margin:2px 0;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" name="mergedDevs" value="${e.id}" ${curDevs.includes(e.id) ? 'checked' : ''}>
                    <span>${esc(e.name)}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <div>
              <label class="fl">Участники-агенты (выбрано: ${curAgents.length})</label>
              <div style="max-height:110px;overflow:auto;padding:6px 10px;border:1px solid var(--line2);border-radius:6px;background:#FAFAFA">
                ${agentsList.map(e => `
                  <label class="cb" style="font-size:12px;margin:2px 0;display:flex;align-items:center;gap:6px">
                    <input type="checkbox" name="mergedAgents" value="${e.id}" ${curAgents.includes(e.id) ? 'checked' : ''}>
                    <span>${esc(e.name)}</span>
                  </label>
                `).join('')}
              </div>
            </div>

            <!-- Description with join button -->
            <div class="full">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <label class="fl" style="margin:0">Описание</label>
                <button type="button" class="btn sm btn-join-descs" style="font-size:10.5px;padding:2px 6px">🔗 Объединить все описания</button>
              </div>
              <textarea name="finalDesc" id="finalDescInp" rows="3">${esc(curDesc)}</textarea>
            </div>

            <!-- Note with join button -->
            <div class="full">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                <label class="fl" style="margin:0">Примечание</label>
                <button type="button" class="btn sm btn-join-notes" style="font-size:10.5px;padding:2px 6px">🔗 Объединить все примечания</button>
              </div>
              <textarea name="finalNote" id="finalNoteInp" rows="2">${esc(curNote)}</textarea>
            </div>
          </form>
        </div>

        <!-- Child Items Section (Automatic transfer & deduplication) -->
        ${childItems.length > 0 ? `
          <div style="background:#F0F9FF;padding:12px 16px;border-radius:10px;border:1px solid #BAE6FD">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:8px">
              <div>
                <b style="font-size:13px;color:#0369A1">
                  📦 Дочерние ${entMeta.childRu} (${childItems.length} шт.)
                </b>
                <div style="font-size:11.5px;color:#0284C7">Будут автоматически перенесены в главную запись</div>
              </div>
              ${hasDuplicateChildren ? `
                <label class="cb" style="font-size:12px;color:#0369A1;display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:600">
                  <input type="checkbox" id="chkMergeChildDups" ${mergeDuplicatesToggle ? 'checked' : ''}>
                  <span>Объединить дубликаты ${entMeta.childGen} (с одинаковыми названиями)</span>
                </label>
              ` : ''}
            </div>
            <div style="max-height:140px;overflow:auto;background:#fff;border-radius:6px;border:1px solid #E0F2FE;padding:6px 10px">
              ${childItems.map(c => {
                const parentRec = mergeItems.find(p => p.id === (ent === 'projects' ? c.projectId : c.taskId));
                const isDup = (childNamesCount[(c.name || '').trim().toLowerCase()] || 0) > 1;
                return `
                  <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 0;border-bottom:1px solid #F0F9FF">
                    <span class="mono" style="font-weight:700;color:#0369A1">${esc(c.num || '—')}</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.name)}</span>
                    ${isDup ? `<span class="chip" style="font-size:9.5px;background:#FEF3C7;color:#92400E;font-weight:700">ОДИНАКОВОЕ ИМЯ</span>` : ''}
                    <span class="chip" style="font-size:10px;background:#F1F5F9;color:var(--mut)">Ранее в: ${esc(parentRec?.num || 'Запись')}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

      </div>
    `;

    box.el.querySelector('.mdl-b').innerHTML = html;
    setupColorSelects(box.el);

    const btnExec = box.el.querySelector('#btnDoExecuteMerge');
    if (btnExec) {
      btnExec.disabled = isSingleSelection;
      btnExec.textContent = isSingleSelection
        ? '⚠️ Выберите от 2-х записей'
        : `🔗 Объединить ${mergeItems.length} записей в ${curNum || 'основную'}`;
    }

    // Bind event listeners
    box.el.querySelectorAll('[data-pick-master]').forEach(card => {
      card.onclick = () => {
        masterId = +card.dataset.pickMaster;
        // When master is explicitly picked, update default num if user hadn't changed it
        const newMaster = mergeItems.find(x => x.id === masterId);
        if (formDraft && newMaster) {
          formDraft.num = newMaster.num || '';
        }
        renderModalContent(box);
      };
    });

    box.el.querySelectorAll('.btn-remove-merge').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const remId = +btn.dataset.removeId;
        targetIds = targetIds.filter(x => x !== remId);
        if (masterId === remId && targetIds.length > 0) {
          masterId = targetIds[0];
        }
        renderModalContent(box);
      };
    });

    const addSel = box.el.querySelector('#mergeAddSelect');
    if (addSel) {
      addSel.onchange = () => {
        const val = +addSel.value;
        if (val && !targetIds.includes(val)) {
          targetIds.push(val);
          renderModalContent(box);
        }
      };
    }

    const sInp = box.el.querySelector('#mergeSearchInp');
    if (sInp) {
      sInp.oninput = () => {
        customSearch = sInp.value;
        const newAvailable = allItems.filter(x => !targetIds.includes(x.id) && (
          !customSearch || (x.name + ' ' + (x.num || '')).toLowerCase().includes(customSearch.toLowerCase())
        ));
        if (addSel) {
          addSel.innerHTML = `<option value="">➕ Добавить запись к объединению…</option>` +
            newAvailable.slice(0, 40).map(x => `<option value="${x.id}">${x.num ? esc(x.num) + ' · ' : ''}${esc(x.name)}</option>`).join('');
        }
      };
    }

    const chkDup = box.el.querySelector('#chkMergeChildDups');
    if (chkDup) {
      chkDup.onchange = () => {
        mergeDuplicatesToggle = chkDup.checked;
      };
    }

    // Fast join helper buttons
    box.el.querySelectorAll('.btn-fill-name').forEach(btn => {
      btn.onclick = () => {
        const inp = box.el.querySelector('#finalNameInp');
        if (inp) {
          inp.value = btn.dataset.val;
          if (formDraft) formDraft.name = inp.value;
        }
      };
    });

    const btnJoinNames = box.el.querySelector('.btn-join-names');
    if (btnJoinNames) {
      btnJoinNames.onclick = () => {
        const inp = box.el.querySelector('#finalNameInp');
        if (inp) {
          inp.value = combinedNames.join(' + ');
          if (formDraft) formDraft.name = inp.value;
        }
      };
    }

    const btnJoinDescs = box.el.querySelector('.btn-join-descs');
    if (btnJoinDescs) {
      btnJoinDescs.onclick = () => {
        const inp = box.el.querySelector('#finalDescInp');
        if (inp) {
          inp.value = combinedDescs.join('\n\n');
          if (formDraft) formDraft.desc = inp.value;
        }
      };
    }

    const btnJoinNotes = box.el.querySelector('.btn-join-notes');
    if (btnJoinNotes) {
      btnJoinNotes.onclick = () => {
        const inp = box.el.querySelector('#finalNoteInp');
        if (inp) {
          inp.value = combinedNotes.join('\n\n');
          if (formDraft) formDraft.note = inp.value;
        }
      };
    }
  };

  modal({
    title: `Объединение ${entMeta.plurGen}`,
    sub: 'УМНОЕ ОБЪЕДИНЕНИЕ И РАЗРЕШЕНИЕ КОНФЛИКТОВ',
    wide: true,
    body: '<div class="merge-loading" style="padding:30px;text-align:center">Загрузка мастера объединения...</div>',
    foot: `
      <button class="btn" data-x>Отмена</button>
      <button class="btn pri" id="btnDoExecuteMerge" style="font-weight:700">🔗 Объединить записи</button>
    `,
    mount(box) {
      box.el.querySelector('[data-x]').onclick = () => box.close();
      renderModalContent(box);

      box.el.querySelector('#btnDoExecuteMerge').onclick = async () => {
        const form = box.el.querySelector('#mergeConflictForm');
        if (!form) return;
        const fd = new FormData(form);

        const mergeItems = allItems.filter(x => targetIds.includes(x.id));
        if (mergeItems.length < 2) {
          toast('Выберите как минимум 2 записи для объединения', 'warn');
          return;
        }

        const masterItem = mergeItems.find(x => x.id === masterId) || mergeItems[0];
        const otherItems = mergeItems.filter(x => x.id !== masterItem.id);

        const finalNum = (fd.get('finalNum') || masterItem.num || '').trim();
        const finalName = (fd.get('finalName') || masterItem.name || '').trim();
        if (!finalName) {
          toast('Укажите итоговое название', 'warn');
          return;
        }

        // Build merged record
        const merged = {
          ...masterItem,
          num: finalNum,
          name: finalName,
          desc: fd.get('finalDesc') || '',
          note: fd.get('finalNote') || '',
          statusId: fd.get('statusId') ? +fd.get('statusId') : null,
          priorityId: fd.get('priorityId') ? +fd.get('priorityId') : null,
          customerId: fd.get('customerId') ? +fd.get('customerId') : null,
          devId: fd.get('devId') ? +fd.get('devId') : null,
          agentId: fd.get('agentId') ? +fd.get('agentId') : null,
          start: fd.get('finalStart') || '',
          end: fd.get('finalEnd') || '',
          devs: Array.from(box.el.querySelectorAll('input[name="mergedDevs"]:checked')).map(i => +i.value),
          agents: Array.from(box.el.querySelectorAll('input[name="mergedAgents"]:checked')).map(i => +i.value),
          updatedAt: nowIso()
        };

        // Combine checklists without exact duplicate text
        const mergedChecklists = [];
        const seenChkText = new Set();
        mergeItems.forEach(item => {
          (item.checklists || []).forEach(chk => {
            const norm = (chk.text || '').trim().toLowerCase();
            if (!seenChkText.has(norm)) {
              seenChkText.add(norm);
              mergedChecklists.push({ ...chk });
            }
          });
        });
        merged.checklists = mergedChecklists;

        // Combine notes without exact duplicate text
        const mergedNotes = [];
        const seenNoteText = new Set();
        mergeItems.forEach(item => {
          (item.notes || []).forEach(n => {
            const norm = (n.text || '').trim();
            if (!seenNoteText.has(norm)) {
              seenNoteText.add(norm);
              mergedNotes.push({ ...n });
            }
          });
        });
        merged.notes = mergedNotes;

        if (ent === 'projects') {
          merged.stageId = fd.get('stageId') ? +fd.get('stageId') : null;
          const stageStrat = fd.get('stageProgressStrategy');
          if (stageStrat === 'average' && S.stages && S.stages.length) {
            const avgProg = {};
            S.stages.forEach(st => {
              const vals = mergeItems.map(p => (p.stageProgress ? (p.stageProgress[st.id] || 0) : 0));
              avgProg[st.id] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
            });
            merged.stageProgress = avgProg;
          } else if (stageStrat === 'max' && S.stages && S.stages.length) {
            const maxProg = {};
            S.stages.forEach(st => {
              const vals = mergeItems.map(p => (p.stageProgress ? (p.stageProgress[st.id] || 0) : 0));
              maxProg[st.id] = Math.max(...vals);
            });
            merged.stageProgress = maxProg;
          }
        } else if (ent === 'tasks') {
          merged.projectId = fd.get('projectId') ? +fd.get('projectId') : null;
        } else if (ent === 'changes') {
          merged.taskId = fd.get('taskId') ? +fd.get('taskId') : null;
        }

        try {
          // 1. Update Master Record
          await db[ent].put(merged);

          // 2. Re-parent child tasks if merging projects
          if (ent === 'projects') {
            const tasksToReparent = (S.tasks || []).filter(t => otherItems.some(o => o.id === t.projectId));
            const masterTasks = (S.tasks || []).filter(t => t.projectId === masterItem.id);

            for (const t of tasksToReparent) {
              if (mergeDuplicatesToggle) {
                // Check if master project already has a task with identical name
                const dupMasterTask = masterTasks.find(mt => (mt.name || '').trim().toLowerCase() === (t.name || '').trim().toLowerCase());
                if (dupMasterTask) {
                  // Merge child changes of t into dupMasterTask
                  const changesOfT = (S.changes || []).filter(c => c.taskId === t.id);
                  for (const ch of changesOfT) {
                    ch.taskId = dupMasterTask.id;
                    ch.updatedAt = nowIso();
                    await db.changes.put(ch);
                  }
                  // Delete duplicate task
                  await db.tasks.delete(t.id);
                  continue;
                }
              }

              t.projectId = masterItem.id;
              t.updatedAt = nowIso();
              await db.tasks.put(t);
            }
          }

          // 3. Re-parent child changes if merging tasks
          if (ent === 'tasks') {
            const changesToReparent = (S.changes || []).filter(c => otherItems.some(o => o.id === c.taskId));
            const masterChanges = (S.changes || []).filter(c => c.taskId === masterItem.id);

            for (const c of changesToReparent) {
              if (mergeDuplicatesToggle) {
                const dupMasterChange = masterChanges.find(mc => (mc.name || '').trim().toLowerCase() === (c.name || '').trim().toLowerCase());
                if (dupMasterChange) {
                  // Delete duplicate change
                  await db.changes.delete(c.id);
                  continue;
                }
              }

              c.taskId = masterItem.id;
              c.updatedAt = nowIso();
              await db.changes.put(c);
            }
          }

          // 4. Delete other merged records
          for (const other of otherItems) {
            await db[ent].delete(other.id);
          }

          // 5. Refresh & Save
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);

          toast(`Успешно объединено ${mergeItems.length} ${entMeta.plurGen} в «${merged.name}»`, 'ok');
          box.close();
          if (callbacks.onRefreshPage) callbacks.onRefreshPage();
        } catch (err) {
          console.error('Merge Error:', err);
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка при объединении: ' + err.message, 'err');
        }
      };
    }
  });
}

/**
 * Open Smart Split Modal for an entity into 2+ parts
 */
export function openSplitModal(S, ent, id, callbacks = {}) {
  const item = (S[ent] || []).find(x => x.id === id);
  if (!item) {
    toast('Запись не найдена', 'err');
    return;
  }

  const entMeta = ENT_NAMES[ent] || ENT_NAMES.projects;
  const baseNum = item.num || '1';

  // Find child items
  let childItems = [];
  if (ent === 'projects') {
    childItems = (S.tasks || []).filter(t => t.projectId === item.id);
  } else if (ent === 'tasks') {
    childItems = (S.changes || []).filter(c => c.taskId === item.id);
  }

  // Initial parts state (2 parts by default)
  let parts = [
    {
      partIdx: 1,
      num: `${baseNum}/1`,
      name: `${item.name} (Часть 1)`,
      desc: item.desc || '',
      note: item.note || '',
      statusId: item.statusId,
      priorityId: item.priorityId,
      devId: item.devId,
      agentId: item.agentId,
      customerId: item.customerId,
      start: item.start || '',
      end: item.end || '',
      stageId: item.stageId,
      projectId: item.projectId,
      taskId: item.taskId,
      stageProgress: item.stageProgress ? { ...item.stageProgress } : {},
      agents: item.agents ? [...item.agents] : [],
      devs: item.devs ? [...item.devs] : []
    },
    {
      partIdx: 2,
      num: `${baseNum}/2`,
      name: `${item.name} (Часть 2)`,
      desc: item.desc || '',
      note: item.note || '',
      statusId: item.statusId,
      priorityId: item.priorityId,
      devId: item.devId,
      agentId: item.agentId,
      customerId: item.customerId,
      start: item.start || '',
      end: item.end || '',
      stageId: item.stageId,
      projectId: item.projectId,
      taskId: item.taskId,
      stageProgress: item.stageProgress ? { ...item.stageProgress } : {},
      agents: item.agents ? [...item.agents] : [],
      devs: item.devs ? [...item.devs] : []
    }
  ];

  // Child items assignment: map childId -> target part index (1, 2, ...)
  let childAssignments = {};
  childItems.forEach((c, idx) => {
    childAssignments[c.id] = (idx % parts.length) + 1; // distribute evenly by default
  });

  const statuses = ent === 'projects' ? S.projectStatuses : S.taskStatuses;
  const devsList = S.employees.filter(e => e.role === 'dev') || [];
  const agentsList = S.employees.filter(e => e.role === 'agent') || [];

  const renderModalContent = (box) => {
    const html = `
      <div class="split-modal-container" style="display:flex;flex-direction:column;gap:16px">

        <!-- Original Record Info Bar -->
        <div style="background:#F8FAFC;padding:12px 16px;border-radius:10px;border:1px solid var(--line2);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;letter-spacing:.06em">Исходная запись:</span>
            <div style="font-size:14px;font-weight:700;color:var(--ink)">
              <span class="mono" style="color:var(--acc)">${esc(item.num || '')}</span> · ${esc(item.name)}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:var(--mut)">Разделить на: <b>${parts.length} частей</b></span>
            <button type="button" class="btn sm pri" id="btnAddSplitPart" style="font-weight:700">➕ Добавить еще часть</button>
          </div>
        </div>

        <!-- Parts Configuration Cards -->
        <div class="split-parts-list" style="display:flex;flex-direction:column;gap:14px">
          ${parts.map((p, pIdx) => {
            return `
              <div class="split-part-card" data-part-idx="${p.partIdx}" style="background:#fff;border-radius:10px;border:1px solid var(--line2);padding:14px 16px;box-shadow:var(--sh)">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--line2)">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span class="chip" style="background:var(--ink);color:#fff;font-weight:700;font-size:11px">Часть ${p.partIdx}</span>
                    <span style="font-size:12.5px;color:var(--mut)">${p.partIdx === 1 ? '(Сохранит основной ID)' : '(Будет создана как новая запись)'}</span>
                  </div>
                  ${parts.length > 2 ? `
                    <button type="button" class="btn sm err btn-remove-part" data-rem-idx="${p.partIdx}" style="padding:2px 8px;font-size:11px">🗑 Удалить часть</button>
                  ` : ''}
                </div>

                <div class="fgrid">
                  <!-- Part Number -->
                  <div>
                    <label class="fl">Номер / Код (авто или вручную)</label>
                    <input type="text" class="mono part-inp-num" data-pidx="${pIdx}" value="${esc(p.num)}" required style="font-weight:700">
                  </div>

                  <!-- Part Name -->
                  <div>
                    <label class="fl">Название части</label>
                    <input type="text" class="part-inp-name" data-pidx="${pIdx}" value="${esc(p.name)}" required>
                  </div>

                  <!-- Customer -->
                  <div>
                    <label class="fl">Заказчик</label>
                    <select class="part-inp-cust" data-pidx="${pIdx}">${renderColorOptions(S.customers || [], p.customerId, '— Не выбран —')}</select>
                  </div>

                  <!-- Status & Priority -->
                  <div>
                    <label class="fl">Статус</label>
                    <select class="part-inp-status" data-pidx="${pIdx}">${renderColorOptions(statuses, p.statusId)}</select>
                  </div>
                  <div>
                    <label class="fl">Приоритет</label>
                    <select class="part-inp-priority" data-pidx="${pIdx}">${renderColorOptions(S.priorities, p.priorityId)}</select>
                  </div>

                  <!-- Dev & Agent -->
                  <div>
                    <label class="fl">Разработчик</label>
                    <select class="part-inp-dev" data-pidx="${pIdx}">${renderColorOptions(devsList, p.devId, '— Не назначен —')}</select>
                  </div>
                  <div>
                    <label class="fl">Агент</label>
                    <select class="part-inp-agent" data-pidx="${pIdx}">${renderColorOptions(agentsList, p.agentId, '— Не назначен —')}</select>
                  </div>

                  <!-- Dates -->
                  <div>
                    <label class="fl">Дата начала</label>
                    <input type="date" class="part-inp-start" data-pidx="${pIdx}" value="${p.start || ''}">
                  </div>
                  <div>
                    <label class="fl">Дата окончания</label>
                    <input type="date" class="part-inp-end" data-pidx="${pIdx}" value="${p.end || ''}">
                  </div>

                  <!-- Description -->
                  <div class="full">
                    <label class="fl">Описание части</label>
                    <textarea class="part-inp-desc" data-pidx="${pIdx}" rows="2">${esc(p.desc || '')}</textarea>
                  </div>

                  <!-- Note -->
                  <div class="full">
                    <label class="fl">Примечание</label>
                    <input type="text" class="part-inp-note" data-pidx="${pIdx}" value="${esc(p.note || '')}">
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Child Items Distribution Section -->
        ${childItems.length > 0 ? `
          <div style="background:#F0FDF4;padding:14px 16px;border-radius:10px;border:1px solid #BBF7D0">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">
              <div>
                <b style="font-size:13px;color:#166534">
                  📦 Распределение дочерних ${entMeta.childRu} (${childItems.length} шт.)
                </b>
                <div style="font-size:11.5px;color:#15803D">Выберите, к какой из созданных частей отойдет каждый элемент</div>
              </div>
              <div style="display:flex;gap:6px">
                <button type="button" class="btn sm btn-assign-all" data-to-part="1" style="font-size:10.5px;padding:3px 8px">Все в Часть 1</button>
                <button type="button" class="btn sm btn-assign-even" style="font-size:10.5px;padding:3px 8px">Поровну</button>
                <button type="button" class="btn sm btn-assign-all" data-to-part="2" style="font-size:10.5px;padding:3px 8px">Все в Часть 2</button>
              </div>
            </div>

            <div style="max-height:200px;overflow:auto;background:#fff;border-radius:8px;border:1px solid #DCFCE7;padding:8px 12px">
              <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead>
                  <tr style="border-bottom:1px solid var(--line2);color:var(--mut);text-align:left">
                    <th style="padding:6px 8px;width:80px">Номер</th>
                    <th style="padding:6px 8px">Название</th>
                    <th style="padding:6px 8px;text-align:right">Назначить в часть</th>
                  </tr>
                </thead>
                <tbody>
                  ${childItems.map(c => {
                    const assignedPart = childAssignments[c.id] || 1;
                    return `
                      <tr style="border-bottom:1px solid #F0FDF4">
                        <td class="mono" style="padding:6px 8px;font-weight:700;color:#166534">${esc(c.num || '—')}</td>
                        <td style="padding:6px 8px;font-weight:500">${esc(c.name)}</td>
                        <td style="padding:6px 8px;text-align:right">
                          <div style="display:inline-flex;gap:4px">
                            ${parts.map(p => {
                              const isSel = assignedPart === p.partIdx;
                              return `
                                <button type="button" class="btn sm btn-pick-child-part ${isSel ? 'pri' : ''}" data-cid="${c.id}" data-pidx="${p.partIdx}" style="padding:2px 7px;font-size:11px;font-weight:700">
                                  Ч.${p.partIdx}
                                </button>
                              `;
                            }).join('')}
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : ''}

      </div>
    `;

    box.el.querySelector('.mdl-b').innerHTML = html;
    setupColorSelects(box.el);

    // Track input changes in parts array
    box.el.querySelectorAll('.part-inp-num').forEach(inp => {
      inp.oninput = () => { parts[+inp.dataset.pidx].num = inp.value; };
    });
    box.el.querySelectorAll('.part-inp-name').forEach(inp => {
      inp.oninput = () => { parts[+inp.dataset.pidx].name = inp.value; };
    });
    box.el.querySelectorAll('.part-inp-cust').forEach(inp => {
      inp.onchange = () => { parts[+inp.dataset.pidx].customerId = inp.value ? +inp.value : null; };
    });
    box.el.querySelectorAll('.part-inp-status').forEach(inp => {
      inp.onchange = () => { parts[+inp.dataset.pidx].statusId = inp.value ? +inp.value : null; };
    });
    box.el.querySelectorAll('.part-inp-priority').forEach(inp => {
      inp.onchange = () => { parts[+inp.dataset.pidx].priorityId = inp.value ? +inp.value : null; };
    });
    box.el.querySelectorAll('.part-inp-dev').forEach(inp => {
      inp.onchange = () => { parts[+inp.dataset.pidx].devId = inp.value ? +inp.value : null; };
    });
    box.el.querySelectorAll('.part-inp-agent').forEach(inp => {
      inp.onchange = () => { parts[+inp.dataset.pidx].agentId = inp.value ? +inp.value : null; };
    });
    box.el.querySelectorAll('.part-inp-start').forEach(inp => {
      inp.onchange = () => { parts[+inp.dataset.pidx].start = inp.value; };
    });
    box.el.querySelectorAll('.part-inp-end').forEach(inp => {
      inp.onchange = () => { parts[+inp.dataset.pidx].end = inp.value; };
    });
    box.el.querySelectorAll('.part-inp-desc').forEach(inp => {
      inp.oninput = () => { parts[+inp.dataset.pidx].desc = inp.value; };
    });
    box.el.querySelectorAll('.part-inp-note').forEach(inp => {
      inp.oninput = () => { parts[+inp.dataset.pidx].note = inp.value; };
    });

    // Add part button
    const btnAdd = box.el.querySelector('#btnAddSplitPart');
    if (btnAdd) {
      btnAdd.onclick = () => {
        const nextIdx = parts.length + 1;
        parts.push({
          partIdx: nextIdx,
          num: `${baseNum}/${nextIdx}`,
          name: `${item.name} (Часть ${nextIdx})`,
          desc: item.desc || '',
          note: item.note || '',
          statusId: item.statusId,
          priorityId: item.priorityId,
          devId: item.devId,
          agentId: item.agentId,
          customerId: item.customerId,
          start: item.start || '',
          end: item.end || '',
          stageId: item.stageId,
          projectId: item.projectId,
          taskId: item.taskId,
          stageProgress: item.stageProgress ? { ...item.stageProgress } : {},
          agents: item.agents ? [...item.agents] : [],
          devs: item.devs ? [...item.devs] : []
        });
        renderModalContent(box);
      };
    }

    // Remove part button
    box.el.querySelectorAll('.btn-remove-part').forEach(btn => {
      btn.onclick = () => {
        const remIdx = +btn.dataset.remIdx;
        parts = parts.filter(p => p.partIdx !== remIdx);
        // Re-index remaining parts
        parts.forEach((p, idx) => {
          p.partIdx = idx + 1;
        });
        // Re-assign children that were on removed part
        childItems.forEach(c => {
          if (childAssignments[c.id] > parts.length) {
            childAssignments[c.id] = 1;
          }
        });
        renderModalContent(box);
      };
    });

    // Child assignment click handlers
    box.el.querySelectorAll('.btn-pick-child-part').forEach(btn => {
      btn.onclick = () => {
        const cId = +btn.dataset.cid;
        const pIdx = +btn.dataset.pidx;
        childAssignments[cId] = pIdx;
        renderModalContent(box);
      };
    });

    // Bulk child assignment buttons
    box.el.querySelectorAll('.btn-assign-all').forEach(btn => {
      btn.onclick = () => {
        const targetPart = +btn.dataset.toPart;
        childItems.forEach(c => { childAssignments[c.id] = targetPart; });
        renderModalContent(box);
      };
    });

    const btnAssignEven = box.el.querySelector('.btn-assign-even');
    if (btnAssignEven) {
      btnAssignEven.onclick = () => {
        childItems.forEach((c, idx) => {
          childAssignments[c.id] = (idx % parts.length) + 1;
        });
        renderModalContent(box);
      };
    }
  };

  modal({
    title: `Разделение ${entMeta.plurGen}`,
    sub: 'УМНОЕ РАЗДЕЛЕНИЕ И РАСПРЕДЕЛЕНИЕ',
    wide: true,
    body: '<div class="split-loading" style="padding:30px;text-align:center">Загрузка мастера разделения...</div>',
    foot: `
      <button class="btn" data-x>Отмена</button>
      <button class="btn pri" id="btnDoExecuteSplit" style="font-weight:700">✂ Разделить запись</button>
    `,
    mount(box) {
      box.el.querySelector('[data-x]').onclick = () => box.close();
      renderModalContent(box);

      box.el.querySelector('#btnDoExecuteSplit').onclick = async () => {
        if (parts.length < 2) {
          toast('Требуется как минимум 2 части для разделения', 'warn');
          return;
        }

        // Validate parts
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (!p.name.trim()) {
            toast(`Укажите название для Части ${p.partIdx}`, 'warn');
            return;
          }
          if (!p.num.trim()) {
            toast(`Укажите номер для Части ${p.partIdx}`, 'warn');
            return;
          }
        }

        try {
          const createdPartIds = {};

          // Part 1 updates the original record in-place
          const part1Data = {
            ...item,
            ...parts[0],
            id: item.id,
            updatedAt: nowIso()
          };
          delete part1Data.partIdx;
          await db[ent].put(part1Data);
          createdPartIds[1] = item.id;

          // Parts 2..N are created as new records
          for (let i = 1; i < parts.length; i++) {
            const pData = {
              ...item,
              ...parts[i],
              createdAt: nowIso(),
              updatedAt: nowIso()
            };
            delete pData.id;
            delete pData.partIdx;
            const newId = await db[ent].add(pData);
            createdPartIds[parts[i].partIdx] = newId;
          }

          // Re-parent child tasks / changes according to assignments
          if (ent === 'projects') {
            for (const t of childItems) {
              const assignedPartIdx = childAssignments[t.id] || 1;
              const targetProjectId = createdPartIds[assignedPartIdx];
              if (targetProjectId && targetProjectId !== item.id) {
                t.projectId = targetProjectId;
                t.updatedAt = nowIso();
                await db.tasks.put(t);
              }
            }
          } else if (ent === 'tasks') {
            for (const c of childItems) {
              const assignedPartIdx = childAssignments[c.id] || 1;
              const targetTaskId = createdPartIds[assignedPartIdx];
              if (targetTaskId && targetTaskId !== item.id) {
                c.taskId = targetTaskId;
                c.updatedAt = nowIso();
                await db.changes.put(c);
              }
            }
          }

          // Refresh & Save
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);

          toast(`Запись «${item.num || item.name}» успешно разделена на ${parts.length} частей`, 'ok');
          box.close();
          if (callbacks.onRefreshPage) callbacks.onRefreshPage();
        } catch (err) {
          console.error('Split Error:', err);
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка при разделении: ' + err.message, 'err');
        }
      };
    }
  });
}

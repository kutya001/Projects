// src/pages/forms/TaskForm.js
import { esc } from '../../utils/dom.js';
import { nowIso, todayISO, addDays } from '../../utils/date.js';
import { modal } from '../../ui/modal.js';
import { db, refreshAll } from '../../core/db.js';
import { afterChange, setDbBeacon } from '../../utils/logger.js';
import { toast } from '../../ui/toast.js';
import { openViewModal } from './ViewForm.js';
import { openProjectForm } from './ProjectForm.js';
import { renderColorOptions, setupColorSelects } from '../../utils/colorSelect.js';
import { getFormLayout, applyFormLayout, enableInteractiveFormDesigner } from '../../services/formLayout.js';

const DEFAULT_TASK_FIELDS = [
  { id: 'num', label: 'Код / Номер', width: 50 },
  { id: 'projectId', label: 'Родительский проект', width: 100 },
  { id: 'name', label: 'Название задачи', width: 100 },
  { id: 'customerId', label: 'Заказчик', width: 50 },
  { id: 'statusId', label: 'Статус', width: 50 },
  { id: 'priorityId', label: 'Приоритет', width: 50 },
  { id: 'devId', label: 'Ответственный разработчик', width: 50 },
  { id: 'agentId', label: 'Ответственный агент', width: 50 },
  { id: 'extNum', label: '№ в смежной системе', width: 50 },
  { id: 'extLink', label: 'Ссылка на задачу', width: 50 },
  { id: 'start', label: 'Дата начала', width: 50 },
  { id: 'end', label: 'Дата окончания', width: 50 },
  { id: 'agents', label: 'Агенты задачи (команда)', width: 100 },
  { id: 'devs', label: 'Разработчики задачи (команда)', width: 100 },
  { id: 'desc', label: 'Описание', width: 100, height: 70 },
  { id: 'note', label: 'Заметка', width: 100 }
];

function getNextTaskNum(S) {
  const max = S.tasks.reduce((m, x) => {
    const n = parseInt((x.num || '').replace(/\D/g, ''), 10);
    return !isNaN(n) && n > m ? n : m;
  }, 0);
  return 'T-' + String(max + 1).padStart(3, '0');
}

export function openTaskForm(S, id, presetOrOnSave, onSaveCb) {
  let preset = {};
  let onSave = onSaveCb;
  if (typeof presetOrOnSave === 'function') {
    onSave = presetOrOnSave;
  } else if (presetOrOnSave && typeof presetOrOnSave === 'object') {
    preset = presetOrOnSave;
  }

  const today = todayISO();
  const tomorrow = addDays(today, 1);

  const oldT = S.tasks.find(x => x.id === id);
  const t = oldT ? JSON.parse(JSON.stringify(oldT)) : {
    num: preset.num || getNextTaskNum(S),
    projectId: (preset && preset.projectId) || S.projects[0]?.id || null,
    name: preset.name || '',
    desc: preset.desc || '',
    note: preset.note || '',
    statusId: preset.statusId !== undefined ? preset.statusId : (S.taskStatuses[0]?.id || null),
    priorityId: preset.priorityId !== undefined ? preset.priorityId : (S.priorities[0]?.id || null),
    devId: preset.devId !== undefined ? preset.devId : (S.employees.find(e => e.role === 'dev')?.id || null),
    agentId: preset.agentId || null,
    customerId: preset.customerId || null,
    extNum: preset.extNum || '',
    extLink: preset.extLink || '',
    start: preset.start || today,
    end: preset.end || tomorrow,
    agents: preset.agents ? [...preset.agents] : [],
    devs: preset.devs ? [...preset.devs] : []
  };

  const isEdit = !!oldT && !preset.isDuplicate;
  const custsList = S.customers || [];
  const devsList = S.employees.filter(e => e.role === 'dev' && (e.active !== false && e.active !== 0 || e.id === t.devId)) || [];
  const agentsList = S.employees.filter(e => e.role === 'agent' && (e.active !== false && e.active !== 0 || e.id === t.agentId)) || [];

  const mcheck = (role, sel) => (S.employees.filter(e => e.role === role && (e.active !== false && e.active !== 0 || (sel || []).includes(e.id))) || []).map(e => `
    <label><input type="checkbox" name="${role}s" value="${e.id}" ${(sel || []).includes(e.id) ? 'checked' : ''}>${esc(e.name)}${(e.active === false || e.active === 0) ? ' (неактивен)' : ''}</label>
  `).join('') || '<div style="color:var(--mut2)">нет записи</div>';

  const body = `<form id="tf" class="fgrid">
    <div data-field="num"><label class="fl">Код / Номер</label><input type="text" name="num" value="${esc(t.num)}" required></div>
    <div data-field="projectId" class="full">
      <label class="fl">Проект</label>
      <div style="display:flex;gap:6px;align-items:center">
        <select name="projectId" style="flex:1" required>
          <option value="">— Выберите проект —</option>
          ${S.projects.map(p => `<option value="${p.id}" ${p.id === t.projectId ? 'selected' : ''}>${esc(p.name)} (${esc(p.num || '')})</option>`).join('')}
        </select>
        <button type="button" class="btn sm" id="btnPreviewProject" title="Просмотреть выбранный проект" style="padding:6px 10px;white-space:nowrap">👁 Просмотр</button>
      </div>
    </div>
    <div data-field="name" class="full"><label class="fl">Название задачи</label><input type="text" name="name" value="${esc(t.name)}" required></div>
    <div data-field="customerId"><label class="fl">Заказчик</label><select name="customerId"><option value="">— Выбрать заказчика —</option>${custsList.map(c => `<option value="${c.id}" ${c.id === t.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div data-field="statusId"><label class="fl">Статус</label><select name="statusId">${renderColorOptions(S.taskStatuses, t.statusId)}</select></div>
    <div data-field="priorityId"><label class="fl">Приоритет</label><select name="priorityId">${renderColorOptions(S.priorities, t.priorityId)}</select></div>
    <div data-field="devId"><label class="fl">Ответственный разработчик</label><select name="devId">${renderColorOptions(devsList, t.devId, '— Не назначен —')}</select></div>
    <div data-field="agentId"><label class="fl">Ответственный агент (ПМ / Аналитик)</label><select name="agentId">${renderColorOptions(agentsList, t.agentId, '— Не назначен —')}</select></div>
    <div data-field="extNum"><label class="fl">№ в смежной системе</label><input type="text" name="extNum" value="${esc(t.extNum || '')}"></div>
    <div data-field="extLink"><label class="fl">Ссылка на задачу</label><input type="url" name="extLink" value="${esc(t.extLink || '')}"></div>
    <div data-field="start"><label class="fl">Дата начала</label><input type="date" name="start" value="${t.start || today}"></div>
    <div data-field="end"><label class="fl">Дата окончания</label><input type="date" name="end" value="${t.end || tomorrow}"></div>
    <div data-field="agents" class="full"><label class="fl">Дополнительные агенты (ПМ / Аналитики)</label><div class="mcheck">${mcheck('agent', t.agents)}</div></div>
    <div data-field="devs" class="full"><label class="fl">Участники разработки</label><div class="mcheck">${mcheck('dev', t.devs)}</div></div>
    <div data-field="desc" class="full"><label class="fl">Описание</label><textarea name="desc">${esc(t.desc || '')}</textarea></div>
    <div data-field="note" class="full"><label class="fl">Заметка</label><input type="text" name="note" value="${esc((t.notes && t.notes.length ? t.notes[t.notes.length - 1].text : t.note) || '')}" placeholder="Введите текст заметки..."></div>
  </form>`;

  modal({
    title: isEdit ? esc(t.name || 'Редактировать задачу') : 'Новая задача',
    sub: isEdit ? `ЗАДАЧИ · ${t.num || ('ID ' + t.id)}` : 'ЗАДАЧИ · НОВАЯ',
    wide: true,
    body,
    foot: `<button type="button" class="btn sm" id="btnCustFormLayout" style="margin-right:auto">Настроить поля</button><button class="btn" data-x>Отмена</button><button class="btn pri" data-save>Сохранить</button>`,
    mount(box) {
      setupColorSelects(box.el);
      const formEl = box.el.querySelector('#tf');
      
      const designer = enableInteractiveFormDesigner(S, 'taskForm', formEl, DEFAULT_TASK_FIELDS);

      const btnCust = box.el.querySelector('#btnCustFormLayout');
      if (btnCust) {
        btnCust.onclick = () => {
          designer.toggle();
        };
      }
      const btnPrevPj = box.el.querySelector('#btnPreviewProject');
      if (btnPrevPj) {
        btnPrevPj.onclick = () => {
          const selPjId = +box.el.querySelector('select[name="projectId"]').value;
          if (selPjId) {
            openViewModal(S, 'projects', selPjId, {
              onEdit: (e, eid) => openProjectForm(S, eid, onSave),
              autoSave: onSave
            });
          } else {
            toast('Проект не выбран', 'err');
          }
        };
      }

      box.el.querySelector('[data-x]').onclick = () => box.close();
      box.el.querySelector('[data-save]').onclick = async () => {
        const form = box.el.querySelector('#tf');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);

        t.num = fd.get('num');
        t.projectId = +fd.get('projectId') || null;
        t.name = fd.get('name');
        t.statusId = +fd.get('statusId') || null;
        t.priorityId = +fd.get('priorityId') || null;
        t.devId = +fd.get('devId') || null;
        t.agentId = +fd.get('agentId') || null;
        t.customerId = +fd.get('customerId') || null;
        t.extNum = fd.get('extNum');
        t.extLink = fd.get('extLink');
        t.start = fd.get('start') || '';
        t.end = fd.get('end') || '';
        t.desc = fd.get('desc');
        const noteVal = (fd.get('note') || '').trim();
        t.note = noteVal;
        t.notes = t.notes || [];
        const lastNoteText = t.notes.length ? t.notes[t.notes.length - 1].text : '';
        if (noteVal && noteVal !== lastNoteText) {
          t.notes.push({
            id: 'not_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            text: noteVal,
            createdAt: nowIso(),
            updatedAt: nowIso()
          });
        }
        t.agents = [...form.querySelectorAll('input[name="agents"]:checked')].map(i => +i.value);
        t.devs = [...form.querySelectorAll('input[name="devs"]:checked')].map(i => +i.value);

        t.updatedAt = nowIso();
        if (!isEdit) {
          t.createdAt = nowIso();
          t.id = await db.tasks.add(t);
        } else {
          await db.tasks.put(t);
        }

        try {
          await refreshAll(S);
          await afterChange(S, onSave);
          toast(`Задача «${t.name}» сохранена`, 'ok');
          box.close();
        } catch (e) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка записи', 'err');
        }
      };
    }
  });
}

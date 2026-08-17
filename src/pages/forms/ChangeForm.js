// src/pages/forms/ChangeForm.js
import { esc } from '../../utils/dom.js';
import { nowIso, todayISO, addDays } from '../../utils/date.js';
import { modal } from '../../ui/modal.js';
import { db, refreshAll } from '../../core/db.js';
import { afterChange, setDbBeacon } from '../../utils/logger.js';
import { toast } from '../../ui/toast.js';
import { openViewModal } from './ViewForm.js';
import { openTaskForm } from './TaskForm.js';
import { renderColorOptions, setupColorSelects } from '../../utils/colorSelect.js';
import { getFormLayout, applyFormLayout, enableInteractiveFormDesigner } from '../../services/formLayout.js';

const DEFAULT_CHANGE_FIELDS = [
  { id: 'num', label: 'Код / Номер', width: 50 },
  { id: 'taskId', label: 'Родительская задача', width: 100 },
  { id: 'name', label: 'Название изменения', width: 100 },
  { id: 'customerId', label: 'Заказчик', width: 50 },
  { id: 'statusId', label: 'Статус', width: 50 },
  { id: 'priorityId', label: 'Приоритет', width: 50 },
  { id: 'devId', label: 'Ответственный разработчик', width: 50 },
  { id: 'agentId', label: 'Ответственный агент', width: 50 },
  { id: 'extNum', label: '№ в системе', width: 50 },
  { id: 'extLink', label: 'Ссылка', width: 50 },
  { id: 'start', label: 'Дата начала', width: 50 },
  { id: 'end', label: 'Дата окончания', width: 50 },
  { id: 'desc', label: 'Описание', width: 100, height: 70 },
  { id: 'note', label: 'Заметка', width: 100 }
];

function getNextChangeNum(S) {
  const max = S.changes.reduce((m, x) => {
    const n = parseInt((x.num || '').replace(/\D/g, ''), 10);
    return !isNaN(n) && n > m ? n : m;
  }, 0);
  return 'C-' + String(max + 1).padStart(3, '0');
}

export function openChangeForm(S, id, presetOrOnSave, onSaveCb) {
  let preset = {};
  let onSave = onSaveCb;
  if (typeof presetOrOnSave === 'function') {
    onSave = presetOrOnSave;
  } else if (presetOrOnSave && typeof presetOrOnSave === 'object') {
    preset = presetOrOnSave;
  }

  const today = todayISO();
  const tomorrow = addDays(today, 1);

  const oldC = S.changes.find(x => x.id === id);
  const c = oldC ? JSON.parse(JSON.stringify(oldC)) : {
    num: preset.num || getNextChangeNum(S),
    taskId: (preset && preset.taskId) || S.tasks[0]?.id || null,
    name: preset.name || '',
    desc: preset.desc || '',
    note: preset.note || '',
    statusId: preset.statusId !== undefined ? preset.statusId : (S.taskStatuses[0]?.id || null),
    priorityId: preset.priorityId !== undefined ? preset.priorityId : (S.priorities[0]?.id || null),
    devId: preset.devId || null,
    agentId: preset.agentId || null,
    customerId: preset.customerId || null,
    extNum: preset.extNum || '',
    extLink: preset.extLink || '',
    start: preset.start || today,
    end: preset.end || tomorrow
  };

  const isEdit = !!oldC && !preset.isDuplicate;
  const custsList = S.customers || [];
  const devsList = S.employees.filter(e => e.role === 'dev' && (e.active !== false && e.active !== 0 || e.id === c.devId)) || [];
  const agentsList = S.employees.filter(e => e.role === 'agent' && (e.active !== false && e.active !== 0 || e.id === c.agentId)) || [];

  const body = `<form id="cf" class="fgrid">
    <div data-field="num"><label class="fl">Код / Номер</label><input type="text" name="num" value="${esc(c.num)}" required></div>
    <div data-field="taskId" class="full">
      <label class="fl">Родительская задача</label>
      <div style="display:flex;gap:6px;align-items:center">
        <select name="taskId" style="flex:1" required>
          <option value="">— Выберите задачу —</option>
          ${S.tasks.map(t => {
            const p = S.projects.find(pj => pj.id === t.projectId);
            const pLabel = p ? ` [${p.name}]` : '';
            return `<option value="${t.id}" ${t.id === c.taskId ? 'selected' : ''}>${esc(t.name)} (${esc(t.num || '')})${esc(pLabel)}</option>`;
          }).join('')}
        </select>
        <button type="button" class="btn sm" id="btnPreviewTask" title="Просмотреть выбранную задачу" style="padding:6px 10px;white-space:nowrap">👁 Просмотр</button>
      </div>
    </div>
    <div data-field="name" class="full"><label class="fl">Название изменения</label><input type="text" name="name" value="${esc(c.name)}" required></div>
    <div data-field="customerId"><label class="fl">Заказчик</label><select name="customerId"><option value="">— Выбрать заказчика —</option>${custsList.map(cust => `<option value="${cust.id}" ${cust.id === c.customerId ? 'selected' : ''}>${esc(cust.name)}</option>`).join('')}</select></div>
    <div data-field="statusId"><label class="fl">Статус</label><select name="statusId">${renderColorOptions(S.taskStatuses, c.statusId)}</select></div>
    <div data-field="priorityId"><label class="fl">Приоритет</label><select name="priorityId">${renderColorOptions(S.priorities, c.priorityId)}</select></div>
    <div data-field="devId"><label class="fl">Ответственный разработчик</label><select name="devId">${renderColorOptions(devsList, c.devId, '— Не назначен —')}</select></div>
    <div data-field="agentId"><label class="fl">Ответственный агент (ПМ / Аналитик)</label><select name="agentId">${renderColorOptions(agentsList, c.agentId, '— Не назначен —')}</select></div>
    <div data-field="extNum"><label class="fl">№ в системе</label><input type="text" name="extNum" value="${esc(c.extNum || '')}"></div>
    <div data-field="extLink"><label class="fl">Ссылка</label><input type="url" name="extLink" value="${esc(c.extLink || '')}"></div>
    <div data-field="start"><label class="fl">Дата начала</label><input type="date" name="start" value="${c.start || today}"></div>
    <div data-field="end"><label class="fl">Дата окончания</label><input type="date" name="end" value="${c.end || tomorrow}"></div>
    <div data-field="desc" class="full"><label class="fl">Описание</label><textarea name="desc">${esc(c.desc || '')}</textarea></div>
    <div data-field="note" class="full"><label class="fl">Заметка</label><input type="text" name="note" value="${esc((c.notes && c.notes.length ? c.notes[c.notes.length - 1].text : c.note) || '')}" placeholder="Введите текст заметки..."></div>
  </form>`;

  modal({
    title: isEdit ? esc(c.name || 'Редактировать изменение') : 'Новое изменение',
    sub: isEdit ? `ИЗМЕНЕНИЯ · ${c.num || ('ID ' + c.id)}` : 'ИЗМЕНЕНИЯ · НОВОЕ',
    wide: true,
    body,
    foot: `<button type="button" class="btn sm" id="btnCustFormLayout" style="margin-right:auto">Настроить поля</button><button class="btn" data-x>Отмена</button><button class="btn pri" data-save>Сохранить</button>`,
    mount(box) {
      setupColorSelects(box.el);
      const formEl = box.el.querySelector('#cf');
      
      const designer = enableInteractiveFormDesigner(S, 'changeForm', formEl, DEFAULT_CHANGE_FIELDS);

      const btnCust = box.el.querySelector('#btnCustFormLayout');
      if (btnCust) {
        btnCust.onclick = () => {
          designer.toggle();
        };
      }
      const btnPrevTk = box.el.querySelector('#btnPreviewTask');
      if (btnPrevTk) {
        btnPrevTk.onclick = () => {
          const selTkId = +box.el.querySelector('select[name="taskId"]').value;
          if (selTkId) {
            openViewModal(S, 'tasks', selTkId, {
              onEdit: (e, eid) => openTaskForm(S, eid, onSave),
              autoSave: onSave
            });
          } else {
            toast('Задача не выбрана', 'err');
          }
        };
      }

      box.el.querySelector('[data-x]').onclick = () => box.close();
      box.el.querySelector('[data-save]').onclick = async () => {
        const form = box.el.querySelector('#cf');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);

        c.num = fd.get('num');
        c.taskId = +fd.get('taskId') || null;
        c.name = fd.get('name');
        c.statusId = +fd.get('statusId') || null;
        c.priorityId = +fd.get('priorityId') || null;
        c.devId = +fd.get('devId') || null;
        c.agentId = +fd.get('agentId') || null;
        c.customerId = +fd.get('customerId') || null;
        c.extNum = fd.get('extNum');
        c.extLink = fd.get('extLink');
        c.start = fd.get('start') || '';
        c.end = fd.get('end') || '';
        c.desc = fd.get('desc');
        const noteVal = (fd.get('note') || '').trim();
        c.note = noteVal;
        c.notes = c.notes || [];
        const lastNoteText = c.notes.length ? c.notes[c.notes.length - 1].text : '';
        if (noteVal && noteVal !== lastNoteText) {
          c.notes.push({
            id: 'not_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            text: noteVal,
            createdAt: nowIso(),
            updatedAt: nowIso()
          });
        }

        c.updatedAt = nowIso();
        if (!isEdit) {
          c.createdAt = nowIso();
          c.id = await db.changes.add(c);
        } else {
          await db.changes.put(c);
        }

        try {
          await refreshAll(S);
          await afterChange(S, onSave);
          toast(`Изменение «${c.name}» сохранено`, 'ok');
          box.close();
        } catch (e) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка записи', 'err');
        }
      };
    }
  });
}

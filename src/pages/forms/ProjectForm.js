// src/pages/forms/ProjectForm.js
import { esc } from '../../utils/dom.js';
import { nowIso, todayISO, addDays } from '../../utils/date.js';
import { modal } from '../../ui/modal.js';
import { db, refreshAll } from '../../core/db.js';
import { afterChange, setDbBeacon } from '../../utils/logger.js';
import { toast } from '../../ui/toast.js';
import { renderColorOptions, setupColorSelects } from '../../utils/colorSelect.js';
import { getFormLayout, applyFormLayout, enableInteractiveFormDesigner } from '../../services/formLayout.js';

const DEFAULT_PROJECT_FIELDS = [
  { id: 'num', label: 'Код / Номер', width: 50 },
  { id: 'statusId', label: 'Статус проекта', width: 50 },
  { id: 'name', label: 'Название проекта', width: 100 },
  { id: 'customerId', label: 'Заказчик', width: 50 },
  { id: 'priorityId', label: 'Приоритет', width: 50 },
  { id: 'stageId', label: 'Текущий этап', width: 50 },
  { id: 'devId', label: 'Разработчик (гл.)', width: 50 },
  { id: 'agentId', label: 'Ответственный агент', width: 100 },
  { id: 'start', label: 'Дата начала', width: 50 },
  { id: 'end', label: 'Дата окончания', width: 50 },
  { id: 'agents', label: 'Агенты проекта (команда)', width: 100 },
  { id: 'devs', label: 'Разработчики проекта (команда)', width: 100 },
  { id: 'stageed', label: 'Прогресс по этапам (%)', width: 100 },
  { id: 'desc', label: 'Описание', width: 100, height: 70 },
  { id: 'note', label: 'Заметка', width: 100 }
];

function getNextProjectNum(S) {
  const max = S.projects.reduce((m, x) => {
    const n = parseInt((x.num || '').replace(/\D/g, ''), 10);
    return !isNaN(n) && n > m ? n : m;
  }, 0);
  return 'P-' + String(max + 1).padStart(3, '0');
}

export function openProjectForm(S, id, presetOrOnSave, onSaveCb) {
  let preset = {};
  let onSave = onSaveCb;
  if (typeof presetOrOnSave === 'function') {
    onSave = presetOrOnSave;
  } else if (presetOrOnSave && typeof presetOrOnSave === 'object') {
    preset = presetOrOnSave;
  }

  const today = todayISO();
  const tomorrow = addDays(today, 1);

  const oldP = S.projects.find(x => x.id === id);
  const p = oldP ? JSON.parse(JSON.stringify(oldP)) : {
    num: preset.num || getNextProjectNum(S),
    name: preset.name || '',
    desc: preset.desc || '',
    note: preset.note || '',
    statusId: preset.statusId !== undefined ? preset.statusId : (S.projectStatuses[0]?.id || null),
    priorityId: preset.priorityId !== undefined ? preset.priorityId : (S.priorities[0]?.id || null),
    stageId: preset.stageId !== undefined ? preset.stageId : (S.stages[0]?.id || null),
    devId: preset.devId || null,
    agentId: preset.agentId || null,
    customerId: preset.customerId || null,
    start: preset.start || today,
    end: preset.end || tomorrow,
    stageProgress: preset.stageProgress ? JSON.parse(JSON.stringify(preset.stageProgress)) : {},
    agents: preset.agents ? [...preset.agents] : [],
    devs: preset.devs ? [...preset.devs] : []
  };

  const isEdit = !!oldP && !preset.isDuplicate;
  const devsList = S.employees.filter(e => e.role === 'dev' && (e.active !== false && e.active !== 0 || e.id === p.devId)) || [];
  const agentsList = S.employees.filter(e => e.role === 'agent' && (e.active !== false && e.active !== 0 || e.id === p.agentId)) || [];
  const custsList = S.customers || [];

  const mcheck = (role, sel) => (S.employees.filter(e => e.role === role && (e.active !== false && e.active !== 0 || (sel || []).includes(e.id))) || []).map(e => `
    <label><input type="checkbox" name="${role}s" value="${e.id}" ${(sel || []).includes(e.id) ? 'checked' : ''}>${esc(e.name)}${(e.active === false || e.active === 0) ? ' (неактивен)' : ''}</label>
  `).join('') || '<div style="color:var(--mut2)">нет записи</div>';

  const body = `<form id="pf" class="fgrid">
    <div data-field="num"><label class="fl">Код / Номер</label><input type="text" name="num" value="${esc(p.num)}" required></div>
    <div data-field="statusId"><label class="fl">Статус</label><select name="statusId">${renderColorOptions(S.projectStatuses, p.statusId)}</select></div>
    <div data-field="name" class="full"><label class="fl">Название проекта</label><input type="text" name="name" value="${esc(p.name)}" required></div>
    <div data-field="customerId"><label class="fl">Заказчик</label><select name="customerId"><option value="">— Выбрать заказчика —</option>${custsList.map(c => `<option value="${c.id}" ${c.id === p.customerId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div data-field="priorityId"><label class="fl">Приоритет</label><select name="priorityId">${renderColorOptions(S.priorities, p.priorityId)}</select></div>
    <div data-field="stageId"><label class="fl">Текущий этап</label><select name="stageId">${renderColorOptions(S.stages, p.stageId, '— Не выбран —')}</select></div>
    <div data-field="devId"><label class="fl">Разработчик (гл.)</label><select name="devId">${renderColorOptions(devsList, p.devId, '— Не назначен —')}</select></div>
    <div data-field="agentId" class="full"><label class="fl">Ответственный агент (ПМ / Аналитик)</label><select name="agentId">${renderColorOptions(agentsList, p.agentId, '— Не назначен —')}</select></div>
    <div data-field="start"><label class="fl">Дата начала</label><input type="date" name="start" value="${p.start || today}"></div>
    <div data-field="end"><label class="fl">Дата окончания</label><input type="date" name="end" value="${p.end || tomorrow}"></div>
    <div data-field="agents" class="full"><label class="fl">Агенты проекта (ПМ / Аналитики)</label><div class="mcheck">${mcheck('agent', p.agents)}</div></div>
    <div data-field="devs" class="full"><label class="fl">Разработчики проекта (команда)</label><div class="mcheck">${mcheck('dev', p.devs)}</div></div>
    <div data-field="stageed" class="full"><label class="fl">Прогресс по этапам (%)</label>
      <div class="stageed" style="display:flex;flex-direction:column;gap:6px;background:#F8F9F4;padding:10px 12px;border-radius:8px;border:1px solid var(--line2)">${S.stages.map(st => {
        const val = p.stageProgress ? (p.stageProgress[st.id] || 0) : 0;
        return `<div class="sr" style="display:flex;align-items:center;gap:10px;padding:2px 0">
          <span style="width:140px;font-size:12.5px;font-weight:600">${esc(st.name)}</span>
          <input type="range" min="0" max="100" data-sp="${st.id}" value="${val}" style="flex:1;cursor:pointer">
          <div style="display:flex;align-items:center;gap:3px;width:75px">
            <input type="number" min="0" max="100" data-spnum="${st.id}" value="${val}" style="width:52px;padding:3px 5px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700">
            <span style="font-size:11.5px;color:var(--mut);font-weight:700">%</span>
          </div>
        </div>`;
      }).join('') || '<div>Этапы не заведены</div>'}</div>
    </div>
    <div data-field="desc" class="full"><label class="fl">Описание</label><textarea name="desc">${esc(p.desc || '')}</textarea></div>
    <div data-field="note" class="full"><label class="fl">Заметка</label><input type="text" name="note" value="${esc((p.notes && p.notes.length ? p.notes[p.notes.length - 1].text : p.note) || '')}" placeholder="Введите текст заметки..."></div>
  </form>`;

  modal({
    title: isEdit ? esc(p.name || 'Редактировать проект') : 'Новый проект',
    sub: isEdit ? `ПРОЕКТЫ · ${p.num || ('ID ' + p.id)}` : 'ПРОЕКТЫ · НОВЫЙ',
    wide: true,
    body,
    foot: `<button type="button" class="btn sm" id="btnCustFormLayout" style="margin-right:auto">Настроить поля</button><button class="btn" data-x>Отмена</button><button class="btn pri" data-save>Сохранить</button>`,
    mount(box) {
      setupColorSelects(box.el);
      const formEl = box.el.querySelector('#pf');
      
      const designer = enableInteractiveFormDesigner(S, 'projectForm', formEl, DEFAULT_PROJECT_FIELDS);

      const btnCust = box.el.querySelector('#btnCustFormLayout');
      if (btnCust) {
        btnCust.onclick = () => {
          designer.toggle();
        };
      }
      const stageSel = box.el.querySelector('select[name="stageId"]');

      const syncStageVal = (stId, rawVal) => {
        let val = Math.max(0, Math.min(100, parseInt(rawVal, 10) || 0));
        const rInput = box.el.querySelector(`input[data-sp="${stId}"]`);
        const nInput = box.el.querySelector(`input[data-spnum="${stId}"]`);
        if (rInput && +rInput.value !== val) rInput.value = val;
        if (nInput && +nInput.value !== val) nInput.value = val;

        if (val === 100 && stageSel && S.stages && S.stages.length) {
          const spId = +stId;
          if (!stageSel.value || +stageSel.value === spId) {
            const idx = S.stages.findIndex(st => st.id === spId);
            if (idx !== -1 && idx < S.stages.length - 1) {
              const nextSt = S.stages[idx + 1];
              stageSel.value = nextSt.id;
              toast(`Этап «${S.stages[idx].name}» выполнен на 100%. Проект переведен на следующий этап «${nextSt.name}»`, 'ok');
            }
          }
        }
      };

      box.el.querySelectorAll('input[data-sp]').forEach(r => {
        r.oninput = () => syncStageVal(r.dataset.sp, r.value);
      });

      box.el.querySelectorAll('input[data-spnum]').forEach(n => {
        n.oninput = () => syncStageVal(n.dataset.spnum, n.value);
        n.onblur = () => syncStageVal(n.dataset.spnum, n.value);
      });

      box.el.querySelector('[data-x]').onclick = () => box.close();
      box.el.querySelector('[data-save]').onclick = async () => {
        const form = box.el.querySelector('#pf');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);

        p.num = fd.get('num');
        p.name = fd.get('name');
        p.desc = fd.get('desc');
        const noteVal = (fd.get('note') || '').trim();
        p.note = noteVal;
        p.notes = p.notes || [];
        const lastNoteText = p.notes.length ? p.notes[p.notes.length - 1].text : '';
        if (noteVal && noteVal !== lastNoteText) {
          p.notes.push({
            id: 'not_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            text: noteVal,
            createdAt: nowIso(),
            updatedAt: nowIso()
          });
        }
        p.statusId = +fd.get('statusId') || null;
        p.priorityId = +fd.get('priorityId') || null;
        p.stageId = +fd.get('stageId') || null;
        p.devId = +fd.get('devId') || null;
        p.agentId = +fd.get('agentId') || null;
        p.customerId = +fd.get('customerId') || null;
        p.start = fd.get('start') || '';
        p.end = fd.get('end') || '';
        p.agents = [...form.querySelectorAll('input[name="agents"]:checked')].map(i => +i.value);
        p.devs = [...form.querySelectorAll('input[name="devs"]:checked')].map(i => +i.value);

        p.stageProgress = {};
        box.el.querySelectorAll('input[data-sp]').forEach(r => p.stageProgress[r.dataset.sp] = Math.max(0, Math.min(100, +r.value || 0)));

        p.updatedAt = nowIso();
        const oldStageId = oldP ? oldP.stageId : null;
        const oldProgress = oldP ? (oldP.stageProgress || {}) : {};

        if (!isEdit) {
          p.createdAt = nowIso();
          p.id = await db.projects.add(p);
          // Initial stage history entry
          if (p.stageId) {
            const initProg = p.stageProgress[p.stageId] || 0;
            await db.stageHistory.add({
              projectId: p.id,
              ts: nowIso(),
              stageId: p.stageId,
              from: 0,
              to: initProg
            });
          }
        } else {
          await db.projects.put(p);
          // Check for individual stage progress changes across all stages
          let stageChangeLogged = false;
          for (const st of (S.stages || [])) {
            const oldVal = oldProgress[st.id] !== undefined ? oldProgress[st.id] : 0;
            const newVal = p.stageProgress[st.id] !== undefined ? p.stageProgress[st.id] : 0;
            if (oldVal !== newVal) {
              await db.stageHistory.add({
                projectId: p.id,
                ts: nowIso(),
                stageId: st.id,
                from: oldVal,
                to: newVal
              });
              if (st.id === p.stageId) stageChangeLogged = true;
            }
          }
          // If the active stage changed but had no progress delta, log stage transition
          if (p.stageId && p.stageId !== oldStageId && !stageChangeLogged) {
            const fromProg = oldProgress[oldStageId] || 0;
            const toProg = p.stageProgress[p.stageId] || 0;
            await db.stageHistory.add({
              projectId: p.id,
              ts: nowIso(),
              stageId: p.stageId,
              from: fromProg,
              to: toProg
            });
          }
        }

        try {
          await refreshAll(S);
          await afterChange(S, onSave);
          toast(`Проект «${p.name}» сохранен`, 'ok');
          box.close();
        } catch (e) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка записи', 'err');
        }
      };
    }
  });
}

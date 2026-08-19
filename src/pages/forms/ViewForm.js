// src/pages/forms/ViewForm.js
import { esc } from '../../utils/dom.js';
import { fmtD, fmtDT, nowIso } from '../../utils/date.js';
import { ENT, REFNAME } from '../../core/state.js';
import { statFor, pri, emp, prj, tsk, stg } from '../../services/refs.js';
import { chipHtml, cellHtml, formatLogValue, FIELD_NAMES } from '../../components/table/renderers.js';
import { colorOf } from '../../utils/color.js';
import { modal } from '../../ui/modal.js';
import { toast } from '../../ui/toast.js';
import { db, refreshAll } from '../../core/db.js';
import { afterChange } from '../../utils/logger.js';
import { duplicateRecord, openQuickChangeModal, createSubItem } from '../../services/quickActions.js';
import { getFormLayout, applyFormLayout, enableInteractiveFormDesigner } from '../../services/formLayout.js';

export function openViewModal(S, ent, id, callbacks = {}, stack = []) {
  if (!stack || !stack.length) {
    stack = [{ ent, id }];
  }

  const curr = stack[stack.length - 1];
  const cEnt = curr.ent;
  const cId = curr.id;

  const list = S[cEnt] || [];
  const r = list.find(x => x.id === cId);
  if (!r) return;

  if (cEnt === 'auditLogs') {
    const rawDetails = typeof r.details === 'object' ? JSON.stringify(r.details, null, 2) : String(r.details || '{}');
    const details = typeof r.details === 'string' ? JSON.parse(r.details || '{}') : (r.details || {});

    let changesTableHtml = '';
    if (details.changes && Object.keys(details.changes).length) {
      changesTableHtml = `
        <div style="background:#fff;border:1px solid var(--line2);border-radius:8px;padding:12px;box-shadow:var(--sh)">
          <div style="font-size:12.5px;font-weight:700;color:var(--ink);text-transform:uppercase;margin-bottom:8px;letter-spacing:.04em">
            📋 Подробности изменений:
          </div>
          <table class="tbl" style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:#F8FAFC;border-bottom:1px solid var(--line2)">
                <th style="padding:7px 10px;text-align:left;font-size:12px;width:170px">Поле</th>
                <th style="padding:7px 10px;text-align:left;font-size:12px">Было (прежнее значение)</th>
                <th style="padding:7px 10px;text-align:left;font-size:12px">Стало (новое значение)</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(details.changes).map(([k, diff]) => {
                const fn = FIELD_NAMES[k] || k;
                const oV = formatLogValue(S, r.entity, k, diff.from);
                const nV = formatLogValue(S, r.entity, k, diff.to);
                return `
                  <tr style="border-bottom:1px solid var(--line2)">
                    <td style="padding:7px 10px;font-weight:700;color:var(--ink);font-size:12px">${esc(fn)}</td>
                    <td style="padding:7px 10px;color:var(--mut);text-decoration:line-through;font-size:12.5px;background:#FFF5F5">${esc(oV)}</td>
                    <td style="padding:7px 10px;color:var(--acc);font-weight:700;font-size:12.5px;background:#F0FDF4">${esc(nV)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    modal({
      title: `Запись аудита #${r.id}`,
      sub: 'ЖУРНАЛ ДЕЙСТВИЙ И ПОДКЛЮЧЕНИЙ',
      wide: true,
      body: `
        <div style="display:flex;flex-direction:column;gap:14px">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;background:#F8FAFC;padding:14px;border-radius:8px;border:1px solid var(--line2)">
            <div><span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700">Дата и время</span><br><b class="mono" style="font-size:13px">${fmtDT(r.ts)}</b></div>
            <div><span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700">IP-адрес</span><br><b class="mono" style="font-size:13px">${esc(r.ip || '—')}</b></div>
            <div><span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700">Действие</span><br>${cellHtml(S, 'auditLogs', { k: 'action', type: 'logAction' }, r)}</div>
            <div><span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700">Модуль / Таблица</span><br>${cellHtml(S, 'auditLogs', { k: 'entity', type: 'logEntity' }, r)}</div>
            <div><span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700">Объект / Запись</span><br><b style="font-size:13px">${esc(r.target || '—')}</b></div>
            <div><span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700">Измененные поля</span><br>${cellHtml(S, 'auditLogs', { k: 'field', type: 'logField' }, r)}</div>
          </div>
          ${changesTableHtml}
          <div>
            <span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px">Браузер / Клиент (User-Agent)</span>
            <div class="mono" style="font-size:11.5px;padding:8px 12px;background:#FAFAFA;border-radius:6px;border:1px solid var(--line2);word-break:break-all">${esc(r.userAgent || '—')}</div>
          </div>
          <div>
            <span style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;display:block;margin-bottom:4px">Сырой JSON (для технического аудита)</span>
            <pre class="mono" style="font-size:11.5px;padding:12px;background:#1E293B;color:#F8FAFC;border-radius:8px;overflow:auto;max-height:220px;margin:0">${esc(rawDetails)}</pre>
          </div>
        </div>
      `,
      foot: '<button class="btn pri" data-close-modal>Закрыть</button>',
      mount(box) {
        box.el.querySelector('[data-close-modal]').onclick = () => box.close();
      }
    });
    return;
  }

  const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };
  const isMainEnt = ['projects', 'tasks', 'changes'].includes(cEnt);
  const entTitle = ENT[cEnt]?.ru || REFNAME[cEnt] || 'Запись';

  // Helper refs
  const st = statFor(S, cEnt, r.statusId);
  const pr = pri(S, r.priorityId);
  const sg = stg(S, r.stageId);
  const dv = emp(S, r.devId);
  const ag = emp(S, r.agentId);
  const pj = prj(S, r.projectId);
  const tk = tsk(S, r.taskId);
  const cs = (S.customers || []).find(c => c.id === r.customerId);

  // Navigation Breadcrumb HTML (only show when navigated into sub-entities)
  const breadcrumbHtml = stack.length > 1 ? `<div class="v-breadcrumb" style="margin-bottom:12px">
    <button class="btn sm v-back" id="vBtnBack" style="font-weight:700">◀ Назад</button>
    <div class="v-path">
      ${stack.map((s, idx) => {
        const item = (S[s.ent] || []).find(x => x.id === s.id);
        const codeName = item ? (item.num ? `${item.num} · ${item.name}` : item.name) : s.ent;
        const eLabel = ENT[s.ent]?.ru || REFNAME[s.ent] || s.ent;
        const isLast = idx === stack.length - 1;
        return isLast
          ? `<span class="v-step curr" title="${esc(codeName)}"><b>${esc(eLabel)}:</b> ${esc(codeName)}</span>`
          : `<button class="v-step link" data-stackidx="${idx}" title="${esc(codeName)}"><b>${esc(eLabel)}:</b> ${esc(codeName)}</button><span class="v-sep">›</span>`;
      }).join('')}
    </div>
  </div>` : '';

  // Compact Hero & Quick Actions Bar
  const heroHtml = `<div class="v-hero" style="padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
    <div class="v-hero-chips" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
      ${st ? chipHtml(st.name, colorOf(st)) : ''}
      ${pr ? chipHtml(pr.name, colorOf(pr)) : ''}
      ${sg ? chipHtml('Этап: ' + sg.name, colorOf(sg)) : ''}
      ${r.role ? `<span class="chip" style="background:#EBF5FF;border-color:#BEE3F8;color:#2B6CB0;font-weight:700">${r.role === 'dev' ? 'Разработчик' : 'Агент (ПМ / Аналитик)'}</span>` : ''}
      ${cEnt === 'employees' ? ((r.active !== false && r.active !== 0) ? '<span class="chip" style="background:#E6FFFA;border-color:#319795;color:#234E52;font-weight:700">● Активен</span>' : '<span class="chip" style="background:#EDF2F7;border-color:#CBD5E0;color:#4A5568;font-weight:700">○ Неактивен (архив)</span>') : ''}
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
      <button class="btn sm" id="vBtnQuickChange" title="Сменить статус, приоритет, этап, ответственных" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        Параметры
      </button>
      <button class="btn sm" id="vBtnDuplicate" title="Дублировать текущую запись" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Дублировать
      </button>
      ${(cEnt === 'projects' && mods.tasks) ? `<button class="btn sm" id="vBtnAddSubTask" title="Создать задачу к проекту" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M12 5v14M5 12h14"/></svg>
        + Задача
      </button>` : ''}
      ${(cEnt === 'tasks' && mods.changes) ? `<button class="btn sm" id="vBtnAddSubChange" title="Создать изменение к задаче" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M12 5v14M5 12h14"/></svg>
        + Изменение
      </button>` : ''}
      <button class="btn sm" id="vBtnCopyCode" title="Скопировать название/код" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
        Копировать
      </button>
    </div>
  </div>`;

  // Multi-Pills for Agents & Devs
  const multiPills = key => ((r[key] || []).map(empId => {
    const e = emp(S, empId);
    return e ? chipHtml(e.name, colorOf(e)) : '';
  }).join(' ') || '<span style="color:var(--mut2)">—</span>');

  // Stats / Overview Grid
  let statsGrid = '';
  if (isMainEnt) {
    const progVal = cEnt === 'projects' && (S.stages || []).length
      ? Math.round(S.stages.reduce((sum, st) => sum + (r.stageProgress ? (r.stageProgress[st.id] || 0) : 0), 0) / S.stages.length)
      : null;

    statsGrid = `<div class="v-stats-grid">
      <div class="v-stat-card">
        <div class="lbl">Сроки выполнения</div>
        <div class="val mono">${r.start ? fmtD(r.start) : '—'} → ${r.end ? fmtD(r.end) : '—'}</div>
      </div>
      ${cs ? `<div class="v-stat-card">
        <div class="lbl">Заказчик</div>
        <div class="val"><button class="v-step link" id="vLinkCustomer" style="font-size:13.5px">${esc(cs.name)}</button></div>
      </div>` : ''}
      ${dv ? `<div class="v-stat-card">
        <div class="lbl">Разработчик</div>
        <div class="val">${chipHtml(dv.name, colorOf(dv))}</div>
      </div>` : ''}
      ${ag ? `<div class="v-stat-card">
        <div class="lbl">Агент</div>
        <div class="val">${chipHtml(ag.name, colorOf(ag))}</div>
      </div>` : ''}
      ${(r.devs && r.devs.length) ? `<div class="v-stat-card">
        <div class="lbl">Со-разработчики</div>
        <div class="val" style="display:flex;gap:4px;flex-wrap:wrap">${r.devs.map(id => { const e = emp(S, id); return e ? chipHtml(e.name, colorOf(e)) : ''; }).join('')}</div>
      </div>` : ''}
      ${(r.agents && r.agents.length) ? `<div class="v-stat-card">
        <div class="lbl">Со-агенты</div>
        <div class="val" style="display:flex;gap:4px;flex-wrap:wrap">${r.agents.map(id => { const e = emp(S, id); return e ? chipHtml(e.name, colorOf(e)) : ''; }).join('')}</div>
      </div>` : ''}
      ${(pj && mods.projects) ? `<div class="v-stat-card">
        <div class="lbl">Родительский проект</div>
        <div class="val"><button class="v-step link" id="vLinkParentPj" style="font-size:13.5px">${esc(pj.name)}</button></div>
      </div>` : ''}
      ${(tk && mods.tasks) ? `<div class="v-stat-card">
        <div class="lbl">Родительская задача</div>
        <div class="val"><button class="v-step link" id="vLinkParentTk" style="font-size:13.5px">${esc(tk.name)}</button></div>
      </div>` : ''}
      ${progVal !== null ? `<div class="v-stat-card">
        <div class="lbl">Итоговый прогресс по этапам</div>
        <div class="val" style="display:flex;align-items:center;gap:8px">
          <div class="progbar" style="width:100px;height:9px"><i id="vHeaderProgBar" style="width:${progVal}%"></i></div>
          <span class="mono" id="vHeaderProgVal" style="font-weight:700;color:var(--acc)">${progVal}%</span>
        </div>
      </div>` : ''}
    </div>`;
  }

  // Editable Stages Progress Section for Projects (Top Apply / Cancel Buttons)
  let stagesEditHtml = '';
  if (cEnt === 'projects' && S.stages && S.stages.length) {
    stagesEditHtml = `<div style="margin-bottom:16px;background:#F8F9F4;border:1px solid var(--line2);border-radius:10px;padding:12px 14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <div class="v-section-title" style="margin:0;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:var(--mut);font-weight:700">Прогресс по этапам проекта</div>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="btn sm pri" id="btnApplyStagesProgress" style="font-size:11.5px;padding:2px 12px;font-weight:700;display:none">Применить</button>
            <button class="btn sm" id="btnCancelStagesProgress" style="font-size:11.5px;padding:2px 12px;display:none">Отменить</button>
          </div>
        </div>
        <span class="mono" id="vStageHelpText" style="font-size:11.5px;color:var(--mut)">Измените ползунки и нажмите «Применить» для сохранения</span>
      </div>
      <div class="stageed" id="vStageSliders" style="display:flex;flex-direction:column;gap:6px">
        ${S.stages.map(st => {
          const val = r.stageProgress ? (r.stageProgress[st.id] || 0) : 0;
          return `<div class="sr" style="display:flex;align-items:center;gap:10px;padding:3px 0">
            <span style="width:130px;font-size:12.5px;font-weight:600">${esc(st.name)}</span>
            <input type="range" min="0" max="100" data-vsp="${st.id}" value="${val}" style="flex:1;cursor:pointer">
            <div style="display:flex;align-items:center;gap:3px;width:75px">
              <input type="number" min="0" max="100" data-vspnum="${st.id}" value="${val}" style="width:52px;padding:3px 5px;text-align:right;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700">
              <span style="font-size:11.5px;color:var(--mut);font-weight:700">%</span>
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // Children Lists
  let kidsHtml = '';
  if (cEnt === 'projects' && mods.tasks) {
    const ts = S.tasks.filter(t => t.projectId === r.id);
    kidsHtml = `<div>
      <div class="v-section-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>Задачи проекта (${ts.length})</span>
        <button class="btn sm pri" id="vBtnAddSubTaskInTab" style="font-size:11.5px">➕ Добавить задачу</button>
      </div>
      <table class="mini-t">
        <thead><tr style="background:#F6F7F2"><td style="font-weight:700">№</td><td style="font-weight:700">Название</td><td style="font-weight:700">Статус</td><td style="font-weight:700">Разработчик</td><td style="font-weight:700">Сроки</td></tr></thead>
        <tbody>${ts.map(t => {
          const tst = statFor(S, 'tasks', t.statusId);
          const tdv = emp(S, t.devId);
          return `<tr data-tid="${t.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(t.num)}</b></td>
            <td><b>${esc(t.name)}</b></td>
            <td>${tst ? chipHtml(tst.name, colorOf(tst)) : '—'}</td>
            <td>${tdv ? chipHtml(tdv.name, colorOf(tdv)) : '—'}</td>
            <td class="mono" style="font-size:12px;color:var(--mut)">${fmtD(t.start)} → ${fmtD(t.end)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" style="color:var(--mut2);padding:12px;text-align:center">Задач пока нет</td></tr>'}</tbody>
      </table>
    </div>`;
  } else if (cEnt === 'tasks' && mods.changes) {
    const cs = S.changes.filter(c => c.taskId === r.id);
    kidsHtml = `<div>
      <div class="v-section-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>Изменения по задаче (${cs.length})</span>
        <button class="btn sm pri" id="vBtnAddSubChangeInTab" style="font-size:11.5px">➕ Добавить изменение</button>
      </div>
      <table class="mini-t">
        <thead><tr style="background:#F6F7F2"><td style="font-weight:700">№</td><td style="font-weight:700">Название</td><td style="font-weight:700">Статус</td><td style="font-weight:700">Разработчик</td><td style="font-weight:700">Сроки</td></tr></thead>
        <tbody>${cs.map(c => {
          const cst = statFor(S, 'changes', c.statusId);
          const cdv = emp(S, c.devId);
          return `<tr data-cid="${c.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(c.num)}</b></td>
            <td><b>${esc(c.name)}</b></td>
            <td>${cst ? chipHtml(cst.name, colorOf(cst)) : '—'}</td>
            <td>${cdv ? chipHtml(cdv.name, colorOf(cdv)) : '—'}</td>
            <td class="mono" style="font-size:12px;color:var(--mut)">${fmtD(c.start)} → ${fmtD(c.end)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="5" style="color:var(--mut2);padding:12px;text-align:center">Изменений пока нет</td></tr>'}</tbody>
      </table>
    </div>`;
  } else if (cEnt === 'employees') {
    const pjs = S.projects.filter(p => p.devId === r.id || p.agentId === r.id || (p.devs || []).includes(r.id) || (p.agents || []).includes(r.id));
    const tks = mods.tasks ? S.tasks.filter(t => t.devId === r.id || t.agentId === r.id || (t.devs || []).includes(r.id) || (t.agents || []).includes(r.id)) : [];

    kidsHtml = `<div>
      <div class="v-section-title">Проекты с участием (${pjs.length})</div>
      <table class="mini-t" style="margin-bottom:16px">
        <tbody>${pjs.map(p => {
          const pst = statFor(S, 'projects', p.statusId);
          return `<tr data-pid="${p.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(p.num)}</b></td>
            <td><b>${esc(p.name)}</b></td>
            <td>${pst ? chipHtml(pst.name, colorOf(pst)) : '—'}</td>
            <td class="mono" style="font-size:12px">${fmtD(p.start)} → ${fmtD(p.end)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" style="color:var(--mut2);padding:12px;text-align:center">Нет привязанных проектов</td></tr>'}</tbody>
      </table>

      ${mods.tasks ? `<div class="v-section-title">Задачи с участием (${tks.length})</div>
      <table class="mini-t">
        <tbody>${tks.map(t => {
          const tst = statFor(S, 'tasks', t.statusId);
          return `<tr data-tid="${t.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(t.num)}</b></td>
            <td><b>${esc(t.name)}</b></td>
            <td>${tst ? chipHtml(tst.name, colorOf(tst)) : '—'}</td>
            <td class="mono" style="font-size:12px">${fmtD(t.start)} → ${fmtD(t.end)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" style="color:var(--mut2);padding:12px;text-align:center">Нет привязанных задач</td></tr>'}</tbody>
      </table>` : ''}
    </div>`;
  } else if (cEnt === 'customers') {
    const pjs = S.projects.filter(p => p.customerId === r.id);
    const tks = mods.tasks ? S.tasks.filter(t => t.customerId === r.id) : [];
    kidsHtml = `<div>
      <div class="v-section-title">Проекты заказчика (${pjs.length})</div>
      <table class="mini-t" style="margin-bottom:16px">
        <tbody>${pjs.map(p => {
          const pst = statFor(S, 'projects', p.statusId);
          return `<tr data-pid="${p.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(p.num)}</b></td>
            <td><b>${esc(p.name)}</b></td>
            <td>${pst ? chipHtml(pst.name, colorOf(pst)) : '—'}</td>
            <td class="mono" style="font-size:12px">${fmtD(p.start)} → ${fmtD(p.end)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" style="color:var(--mut2);padding:12px;text-align:center">Нет привязанных проектов</td></tr>'}</tbody>
      </table>

      ${mods.tasks ? `<div class="v-section-title">Задачи заказчика (${tks.length})</div>
      <table class="mini-t">
        <tbody>${tks.map(t => {
          const tst = statFor(S, 'tasks', t.statusId);
          return `<tr data-tid="${t.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(t.num)}</b></td>
            <td><b>${esc(t.name)}</b></td>
            <td>${tst ? chipHtml(tst.name, colorOf(tst)) : '—'}</td>
            <td class="mono" style="font-size:12px">${fmtD(t.start)} → ${fmtD(t.end)}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="4" style="color:var(--mut2);padding:12px;text-align:center">Нет привязанных задач</td></tr>'}</tbody>
      </table>` : ''}
    </div>`;
  } else if (cEnt === 'priorities') {
    const pjs = S.projects.filter(p => p.priorityId === r.id);
    const tks = mods.tasks ? S.tasks.filter(t => t.priorityId === r.id) : [];
    const chs = mods.changes ? S.changes.filter(c => c.priorityId === r.id) : [];

    kidsHtml = `<div>
      <div class="v-section-title">Проекты с приоритетом «${esc(r.name)}» (${pjs.length})</div>
      <table class="mini-t" style="margin-bottom:16px">
        <tbody>${pjs.map(p => {
          const pst = statFor(S, 'projects', p.statusId);
          return `<tr data-pid="${p.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(p.num)}</b></td>
            <td><b>${esc(p.name)}</b></td>
            <td>${pst ? chipHtml(pst.name, colorOf(pst)) : '—'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="3" style="color:var(--mut2);padding:12px;text-align:center">Нет привязанных проектов</td></tr>'}</tbody>
      </table>

      ${mods.tasks ? `<div class="v-section-title">Задачи с приоритетом «${esc(r.name)}» (${tks.length})</div>
      <table class="mini-t" style="margin-bottom:16px">
        <tbody>${tks.map(t => {
          const tst = statFor(S, 'tasks', t.statusId);
          return `<tr data-tid="${t.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(t.num)}</b></td>
            <td><b>${esc(t.name)}</b></td>
            <td>${tst ? chipHtml(tst.name, colorOf(tst)) : '—'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="3" style="color:var(--mut2);padding:12px;text-align:center">Нет привязанных задач</td></tr>'}</tbody>
      </table>` : ''}

      ${mods.changes ? `<div class="v-section-title">Изменения с приоритетом «${esc(r.name)}» (${chs.length})</div>
      <table class="mini-t">
        <tbody>${chs.map(c => {
          const cst = statFor(S, 'changes', c.statusId);
          return `<tr data-cid="${c.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(c.num)}</b></td>
            <td><b>${esc(c.name)}</b></td>
            <td>${cst ? chipHtml(cst.name, colorOf(cst)) : '—'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="3" style="color:var(--mut2);padding:12px;text-align:center">Нет привязанных изменений</td></tr>'}</tbody>
      </table>` : ''}
    </div>`;
  } else if (cEnt === 'projectStatuses') {
    const pjs = S.projects.filter(p => p.statusId === r.id);
    kidsHtml = `<div>
      <div class="v-section-title">Проекты в статусе «${esc(r.name)}» (${pjs.length})</div>
      <table class="mini-t">
        <tbody>${pjs.map(p => `
          <tr data-pid="${p.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(p.num)}</b></td>
            <td><b>${esc(p.name)}</b></td>
            <td class="mono" style="font-size:12px">${fmtD(p.start)} → ${fmtD(p.end)}</td>
          </tr>
        `).join('') || '<tr><td colspan="3" style="color:var(--mut2);padding:12px;text-align:center">Нет проектов в этом статусе</td></tr>'}</tbody>
      </table>
    </div>`;
  } else if (cEnt === 'taskStatuses') {
    const tks = mods.tasks ? S.tasks.filter(t => t.statusId === r.id) : [];
    const chs = mods.changes ? S.changes.filter(c => c.statusId === r.id) : [];
    kidsHtml = `<div>
      ${mods.tasks ? `<div class="v-section-title">Задачи в статусе «${esc(r.name)}» (${tks.length})</div>
      <table class="mini-t" style="margin-bottom:16px">
        <tbody>${tks.map(t => `
          <tr data-tid="${t.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(t.num)}</b></td>
            <td><b>${esc(t.name)}</b></td>
            <td class="mono" style="font-size:12px">${fmtD(t.start)} → ${fmtD(t.end)}</td>
          </tr>
        `).join('') || '<tr><td colspan="3" style="color:var(--mut2);padding:12px;text-align:center">Нет задач в этом статусе</td></tr>'}</tbody>
      </table>` : ''}

      ${mods.changes ? `<div class="v-section-title">Изменения в статусе «${esc(r.name)}» (${chs.length})</div>
      <table class="mini-t">
        <tbody>${chs.map(c => `
          <tr data-cid="${c.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(c.num)}</b></td>
            <td><b>${esc(c.name)}</b></td>
            <td class="mono" style="font-size:12px">${fmtD(c.start)} → ${fmtD(c.end)}</td>
          </tr>
        `).join('') || '<tr><td colspan="3" style="color:var(--mut2);padding:12px;text-align:center">Нет изменений в этом статусе</td></tr>'}</tbody>
      </table>` : ''}
    </div>`;
  } else if (cEnt === 'stages') {
    const pjs = S.projects.filter(p => p.stageId === r.id);
    kidsHtml = `<div>
      <div class="v-section-title">Проекты на этапе «${esc(r.name)}» (${pjs.length})</div>
      <table class="mini-t">
        <tbody>${pjs.map(p => `
          <tr data-pid="${p.id}" style="cursor:pointer">
            <td><b class="mono" style="color:var(--acc)">${esc(p.num)}</b></td>
            <td><b>${esc(p.name)}</b></td>
            <td class="mono" style="font-size:12px">${fmtD(p.start)} → ${fmtD(p.end)}</td>
          </tr>
        `).join('') || '<tr><td colspan="3" style="color:var(--mut2);padding:12px;text-align:center">Нет проектов на этом этапе</td></tr>'}</tbody>
      </table>
    </div>`;
  }

  // Stage History Tab HTML (for Projects)
  let histHtml = '';
  if (cEnt === 'projects') {
    histHtml = `<div id="vStageHistWrapper"></div>`;
  }

  // Detailed Key-Value Grid
  const detailsHtml = `<dl class="dl" style="margin-bottom:16px">
    ${r.num ? `<dt>Номер / Код</dt><dd><b class="mono" style="font-size:14px;color:var(--acc)">${esc(r.num)}</b></dd>` : ''}
    <dt>Название</dt><dd><b style="font-size:14px;color:var(--ink)">${esc(r.name)}</b></dd>
    ${cs ? `<dt>Заказчик</dt><dd><b>${esc(cs.name)}</b></dd>` : ''}
    ${r.contacts ? `<dt>Контактные данные</dt><dd><b>${esc(r.contacts)}</b></dd>` : ''}
    ${r.extNum ? `<dt>№ в системе</dt><dd><span class="mono">${esc(r.extNum)}</span></dd>` : ''}
    ${r.extLink ? `<dt>Внешняя ссылка</dt><dd><a href="${esc(r.extLink)}" target="_blank" rel="noopener" style="color:var(--acc);font-weight:600">🔗 ${esc(r.extLink)}</a></dd>` : ''}
    ${r.position ? `<dt>Должность / Компания</dt><dd><b>${esc(r.position)}</b></dd>` : ''}
    ${r.weight !== undefined ? `<dt>Вес приоритета</dt><dd class="mono"><b>${r.weight}</b></dd>` : ''}
    ${r.order !== undefined ? `<dt>Порядок сортировки</dt><dd class="mono"><b>${r.order}</b></dd>` : ''}
    ${cEnt !== 'changes' && isMainEnt ? `<dt>Участники Агенты</dt><dd>${multiPills('agents')}</dd>` : ''}
    ${cEnt !== 'changes' && isMainEnt ? `<dt>Участники Разработчики</dt><dd>${multiPills('devs')}</dd>` : ''}
    ${r.createdAt ? `<dt>Создано / Изменено</dt><dd><span class="mono" style="font-size:11.5px;color:var(--mut)">${fmtDT(r.createdAt)} / ${fmtDT(r.updatedAt)}</span></dd>` : ''}
  </dl>`;

function renderViewChecklists(container, S, r, cEnt, callbacks, onBadgeUpdate) {
  r.checklists = r.checklists || [];
  const total = r.checklists.length;
  const done = r.checklists.filter(c => c.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  if (onBadgeUpdate) onBadgeUpdate(done, total);

  const itemsHtml = r.checklists.map((chk, idx) => {
    return `
      <div class="chk-item ${chk.done ? 'is-done' : ''}" data-chkid="${chk.id}">
        <input type="checkbox" class="chk-toggle" data-idx="${idx}" ${chk.done ? 'checked' : ''} style="cursor:pointer;width:17px;height:17px;accent-color:var(--acc)">
        <div class="chk-text" id="chkText_${chk.id}">${esc(chk.text)}</div>
        <div class="chk-actions" style="display:flex;align-items:center;gap:4px">
          <span class="mono" style="font-size:11px;color:var(--mut);margin-right:6px">${chk.createdAt ? fmtDT(chk.createdAt) : ''}</span>
          <button class="btn sm" data-chk-edit="${idx}" title="Редактировать текст" style="padding:2px 6px;font-size:11px">✏️</button>
          <button class="btn sm dgr" data-chk-del="${idx}" title="Удалить пункт" style="padding:2px 6px;font-size:11px">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="background:#fff;border:1px solid var(--line2);border-radius:10px;padding:16px;box-shadow:var(--sh)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:14px;font-weight:700;color:var(--ink)">Чек-лист</span>
          <span class="chip" style="font-size:11.5px;font-weight:700;background:#F0FDF4;color:#166534;border-color:#BBF7D0">
            ${done} из ${total} выполнено (${pct}%)
          </span>
        </div>
        <div class="progbar" style="width:140px;height:8px">
          <i style="width:${pct}%;background:${pct === 100 ? '#2F9E63' : 'var(--acc)'}"></i>
        </div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:14px">
        <input type="text" id="vChkNewInput" class="ipt" placeholder="Добавить новый пункт чек-листа... (нажмите Enter)" style="flex:1;font-size:13px">
        <button class="btn sm pri" id="vBtnAddChkItem" style="font-weight:700">➕ Добавить</button>
      </div>

      <div id="vChkListWrap" style="max-height:420px;overflow-y:auto">
        ${itemsHtml || '<div style="color:var(--mut2);text-align:center;padding:24px;font-size:13px">В чек-листе пока нет пунктов. Добавьте первый пункт выше!</div>'}
      </div>
    </div>
  `;

  // Bind new item add
  const inp = container.querySelector('#vChkNewInput');
  const btnAdd = container.querySelector('#vBtnAddChkItem');
  const doAdd = async () => {
    const text = inp.value.trim();
    if (!text) return;
    r.checklists.push({
      id: 'chk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      text,
      done: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    r.updatedAt = nowIso();
    try {
      await db[cEnt].put(r);
      await refreshAll(S);
      await afterChange(S, callbacks.autoSave);
      renderViewChecklists(container, S, r, cEnt, callbacks, onBadgeUpdate);
    } catch (err) {
      toast('Ошибка: ' + err.message, 'err');
    }
  };
  if (btnAdd) btnAdd.onclick = doAdd;
  if (inp) inp.onkeydown = e => { if (e.key === 'Enter') doAdd(); };

  // Bind checkbox toggle
  container.querySelectorAll('.chk-toggle').forEach(chkBox => {
    chkBox.onchange = async () => {
      const idx = +chkBox.dataset.idx;
      if (r.checklists[idx]) {
        r.checklists[idx].done = chkBox.checked;
        r.checklists[idx].updatedAt = nowIso();
        r.updatedAt = nowIso();
        try {
          await db[cEnt].put(r);
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);
          renderViewChecklists(container, S, r, cEnt, callbacks, onBadgeUpdate);
        } catch (err) {
          toast('Ошибка: ' + err.message, 'err');
        }
      }
    };
  });

  // Bind delete item
  container.querySelectorAll('[data-chk-del]').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.chkDel;
      r.checklists.splice(idx, 1);
      r.updatedAt = nowIso();
      try {
        await db[cEnt].put(r);
        await refreshAll(S);
        await afterChange(S, callbacks.autoSave);
        renderViewChecklists(container, S, r, cEnt, callbacks, onBadgeUpdate);
        toast('Пункт удален', 'ok');
      } catch (err) {
        toast('Ошибка: ' + err.message, 'err');
      }
    };
  });

  // Bind edit item
  container.querySelectorAll('[data-chk-edit]').forEach(btn => {
    btn.onclick = () => {
      const idx = +btn.dataset.chkEdit;
      const item = r.checklists[idx];
      if (!item) return;
      const itemEl = container.querySelector(`[data-chkid="${item.id}"]`);
      if (!itemEl) return;
      itemEl.innerHTML = `
        <input type="text" class="ipt chk-edit-inp" value="${esc(item.text)}" style="flex:1;font-size:13px;padding:4px 8px">
        <button class="btn sm pri" data-chk-save="${idx}" style="padding:3px 8px">Сохранить</button>
        <button class="btn sm" data-chk-cancel="${idx}" style="padding:3px 8px">Отмена</button>
      `;
      const eInp = itemEl.querySelector('.chk-edit-inp');
      if (eInp) eInp.focus();
      const saveEdit = async () => {
        const nText = eInp.value.trim();
        if (!nText) return;
        item.text = nText;
        item.updatedAt = nowIso();
        r.updatedAt = nowIso();
        try {
          await db[cEnt].put(r);
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);
          renderViewChecklists(container, S, r, cEnt, callbacks, onBadgeUpdate);
        } catch (err) {
          toast('Ошибка: ' + err.message, 'err');
        }
      };
      itemEl.querySelector(`[data-chk-save="${idx}"]`).onclick = saveEdit;
      itemEl.querySelector(`[data-chk-cancel="${idx}"]`).onclick = () => {
        renderViewChecklists(container, S, r, cEnt, callbacks, onBadgeUpdate);
      };
      if (eInp) eInp.onkeydown = e => { if (e.key === 'Enter') saveEdit(); };
    };
  });
}

function renderViewNotes(container, S, r, cEnt, callbacks, onBadgeUpdate) {
  r.notes = r.notes || [];
  const total = r.notes.length;

  if (onBadgeUpdate) onBadgeUpdate(total);

  const notesSorted = [...r.notes].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const notesHtml = notesSorted.map(n => {
    const originalIdx = r.notes.indexOf(n);
    return `
      <div class="note-card" style="background:#FAFBF6;border:1px solid var(--line2);border-radius:8px;padding:10px 12px;margin-bottom:10px" data-noteid="${n.id}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font-size:12px;color:var(--mut)">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-weight:700;color:var(--ink)">Заметка</span>
            <span>·</span>
            <span class="mono">${n.createdAt ? fmtDT(n.createdAt) : ''}</span>
            ${n.updatedAt && n.updatedAt !== n.createdAt ? '<span style="color:var(--mut2)">(изменено)</span>' : ''}
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn sm" data-note-edit="${originalIdx}" title="Редактировать заметку" style="padding:2px 6px;font-size:11px">Ред.</button>
            <button class="btn sm dgr" data-note-del="${originalIdx}" title="Удалить заметку" style="padding:2px 6px;font-size:11px">Удалить</button>
          </div>
        </div>
        <div class="note-body" id="noteBody_${n.id}">${esc(n.text)}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="background:#fff;border:1px solid var(--line2);border-radius:10px;padding:16px;box-shadow:var(--sh)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <span style="font-size:14px;font-weight:700;color:var(--ink)">Лента заметок (${total})</span>
        <span class="mono" style="font-size:11.5px;color:var(--mut)">Последняя заметка отображается в таблице</span>
      </div>

      <div style="background:#F8F9FA;padding:12px;border:1px solid var(--line2);border-radius:8px;margin-bottom:16px">
        <textarea id="vNewNoteArea" class="ipt" placeholder="Напишите новую заметку... (Ctrl+Enter для быстрой отправки)" rows="3" style="width:100%;margin-bottom:8px;resize:vertical;font-size:13px;line-height:1.45"></textarea>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="mono" style="font-size:11px;color:var(--mut)">Ctrl+Enter для сохранения</span>
          <button class="btn sm pri" id="vBtnAddNoteItem" style="font-weight:700">📝 Добавить заметку</button>
        </div>
      </div>

      <div id="vNotesListWrap" style="max-height:420px;overflow-y:auto">
        ${notesHtml || '<div style="color:var(--mut2);text-align:center;padding:24px;font-size:13px">Заметок пока нет. Напишите первую заметку выше!</div>'}
      </div>
    </div>
  `;

  // Bind add note
  const tx = container.querySelector('#vNewNoteArea');
  const btnAdd = container.querySelector('#vBtnAddNoteItem');
  const doAddNote = async () => {
    const text = tx.value.trim();
    if (!text) return;
    const newNote = {
      id: 'not_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      text,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    r.notes.push(newNote);
    r.note = text;
    r.updatedAt = nowIso();
    try {
      await db[cEnt].put(r);
      await refreshAll(S);
      await afterChange(S, callbacks.autoSave);
      renderViewNotes(container, S, r, cEnt, callbacks, onBadgeUpdate);
      toast('Заметка добавлена', 'ok');
    } catch (err) {
      toast('Ошибка: ' + err.message, 'err');
    }
  };
  if (btnAdd) btnAdd.onclick = doAddNote;
  if (tx) {
    tx.onkeydown = e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doAddNote();
      }
    };
  }

  // Bind delete note
  container.querySelectorAll('[data-note-del]').forEach(btn => {
    btn.onclick = async () => {
      const idx = +btn.dataset.noteDel;
      r.notes.splice(idx, 1);
      r.note = r.notes.length ? r.notes[r.notes.length - 1].text : '';
      r.updatedAt = nowIso();
      try {
        await db[cEnt].put(r);
        await refreshAll(S);
        await afterChange(S, callbacks.autoSave);
        renderViewNotes(container, S, r, cEnt, callbacks, onBadgeUpdate);
        toast('Заметка удалена', 'ok');
      } catch (err) {
        toast('Ошибка: ' + err.message, 'err');
      }
    };
  });

  // Bind edit note
  container.querySelectorAll('[data-note-edit]').forEach(btn => {
    btn.onclick = () => {
      const idx = +btn.dataset.noteEdit;
      const noteObj = r.notes[idx];
      if (!noteObj) return;
      const noteEl = container.querySelector(`[data-noteid="${noteObj.id}"]`);
      if (!noteEl) return;
      noteEl.innerHTML = `
        <textarea class="ipt note-edit-tx" rows="3" style="width:100%;margin-bottom:8px;font-size:13px;resize:vertical">${esc(noteObj.text)}</textarea>
        <div style="display:flex;justify-content:flex-end;gap:6px">
          <button class="btn sm" data-note-cancel="${idx}">Отмена</button>
          <button class="btn sm pri" data-note-save="${idx}" style="font-weight:700">Сохранить</button>
        </div>
      `;
      const eTx = noteEl.querySelector('.note-edit-tx');
      if (eTx) eTx.focus();
      const saveEditNote = async () => {
        const nText = eTx.value.trim();
        if (!nText) return;
        noteObj.text = nText;
        noteObj.updatedAt = nowIso();
        r.note = r.notes[r.notes.length - 1].text;
        r.updatedAt = nowIso();
        try {
          await db[cEnt].put(r);
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);
          renderViewNotes(container, S, r, cEnt, callbacks, onBadgeUpdate);
          toast('Заметка обновлена', 'ok');
        } catch (err) {
          toast('Ошибка: ' + err.message, 'err');
        }
      };
      noteEl.querySelector(`[data-note-save="${idx}"]`).onclick = saveEditNote;
      noteEl.querySelector(`[data-note-cancel="${idx}"]`).onclick = () => {
        renderViewNotes(container, S, r, cEnt, callbacks, onBadgeUpdate);
      };
      if (eTx) {
        eTx.onkeydown = e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            saveEditNote();
          }
        };
      }
    };
  });
}

function renderProjectStageHistoryView(container, S, r) {
  let period = 'month'; // 'day' | 'month' | 'quarter' | 'year'
  let dateFrom = '';
  let dateTo = '';

  const reDraw = () => {
    const histList = (S.stageHistory && S.stageHistory.length ? S.stageHistory : (S.history || [])).filter(x => x.projectId === r.id);
    
    // Apply date range filters if present
    let filteredHist = histList;
    if (dateFrom) filteredHist = filteredHist.filter(x => (x.ts || '').slice(0, 10) >= dateFrom);
    if (dateTo) filteredHist = filteredHist.filter(x => (x.ts || '').slice(0, 10) <= dateTo);

    const sortedHistDesc = [...filteredHist].sort((a, b) => (a.ts < b.ts ? 1 : -1));

    // Helper to format date into period bucket
    const getPeriodKey = (ts) => {
      if (!ts) return '';
      const d = new Date(ts);
      if (isNaN(d.getTime())) return (ts || '').slice(0, 10);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      if (period === 'day') return `${day}.${m}`;
      if (period === 'month') return `${m}.${String(y).slice(2)}`;
      if (period === 'quarter') {
        const q = Math.floor(d.getMonth() / 3) + 1;
        return `Q${q}'${String(y).slice(2)}`;
      }
      return `${y}`;
    };

    // Mini charts for each stage
    const stageChartsHtml = (S.stages || []).map(stage => {
      const stageHist = filteredHist.filter(x => x.stageId === stage.id).sort((a, b) => (a.ts > b.ts ? 1 : -1));
      const curVal = (r.stageProgress && r.stageProgress[stage.id] !== undefined) ? r.stageProgress[stage.id] : 0;
      const stgColor = colorOf(stage) || '#0B7285';

      // Group transitions into period points
      const pointMap = new Map();
      stageHist.forEach(h => {
        const pk = getPeriodKey(h.ts);
        pointMap.set(pk, h.to); // keep latest value in bucket
      });

      let points = Array.from(pointMap.entries()).map(([label, val]) => ({ label, val }));
      if (points.length === 0) {
        points = [
          { label: 'Старт', val: 0 },
          { label: 'Сейчас', val: curVal }
        ];
      } else if (points.length === 1) {
        points.unshift({ label: 'Старт', val: 0 });
      }

      // Render SVG Sparkline
      const W = 280, H = 80, padL = 30, padR = 16, padT = 16, padB = 22;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const stepX = points.length > 1 ? plotW / (points.length - 1) : plotW;

      const coords = points.map((p, idx) => {
        const x = Math.round(padL + idx * stepX);
        const y = Math.round(padT + (1 - Math.max(0, Math.min(100, p.val)) / 100) * plotH);
        return { ...p, x, y };
      });

      const polylinePoints = coords.map(c => `${c.x},${c.y}`).join(' ');
      const areaPoints = `${coords[0].x},${padT + plotH} ` + polylinePoints + ` ${coords[coords.length - 1].x},${padT + plotH}`;

      const svgChart = `
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="overflow:visible">
          <defs>
            <linearGradient id="grad_stg_${stage.id}_${r.id}" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="${stgColor}" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="${stgColor}" stop-opacity="0.0"/>
            </linearGradient>
          </defs>
          <!-- Guidelines -->
          <line x1="${padL}" y1="${padT}" x2="${W - padR}" y2="${padT}" stroke="#E2E8F0" stroke-dasharray="2,2" stroke-width="1"/>
          <line x1="${padL}" y1="${padT + plotH / 2}" x2="${W - padR}" y2="${padT + plotH / 2}" stroke="#E2E8F0" stroke-dasharray="2,2" stroke-width="1"/>
          <line x1="${padL}" y1="${padT + plotH}" x2="${W - padR}" y2="${padT + plotH}" stroke="#CBD5E1" stroke-width="1"/>
          
          <text x="${padL - 4}" y="${padT + 3}" font-size="8" fill="#94A3B8" font-family="'JetBrains Mono',monospace" text-anchor="end">100%</text>
          <text x="${padL - 4}" y="${padT + plotH + 3}" font-size="8" fill="#94A3B8" font-family="'JetBrains Mono',monospace" text-anchor="end">0%</text>

          <!-- Area and Line -->
          <polygon points="${areaPoints}" fill="url(#grad_stg_${stage.id}_${r.id})"/>
          <polyline points="${polylinePoints}" fill="none" stroke="${stgColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>

          <!-- Points and Labels -->
          ${coords.map(c => `
            <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#fff" stroke="${stgColor}" stroke-width="2"/>
            <text x="${c.x}" y="${Math.max(10, c.y - 6)}" font-size="9" font-weight="700" fill="var(--ink)" font-family="'JetBrains Mono',monospace" text-anchor="middle">${c.val}%</text>
            <text x="${c.x}" y="${H - 4}" font-size="8.5" fill="var(--mut)" font-family="'JetBrains Mono',monospace" text-anchor="middle">${esc(c.label)}</text>
          `).join('')}
        </svg>
      `;

      return `
        <div class="stage-card" style="background:#fff;border:1px solid var(--line2);border-radius:10px;padding:12px;box-shadow:var(--sh);display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="dot" style="background:${stgColor};width:9px;height:9px;border-radius:50%"></span>
              <span style="font-size:13px;font-weight:700;color:var(--ink)">${esc(stage.name)}</span>
            </div>
            <span class="chip mono" style="font-weight:800;font-size:12px;background:#EBF8FA;color:var(--acc)">${curVal}%</span>
          </div>
          <div style="margin-top:4px">
            ${svgChart}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:14px">
        <!-- Controls Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;background:#F8F9F4;padding:10px 14px;border-radius:10px;border:1px solid var(--line2)">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:12px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:0.04em">Разрез периода:</span>
            <div class="seg" id="vhPeriodSeg" style="display:inline-flex;gap:2px">
              <button data-p="day" class="${period === 'day' ? 'on' : ''}" style="padding:3px 8px;font-size:12px">День</button>
              <button data-p="month" class="${period === 'month' ? 'on' : ''}" style="padding:3px 8px;font-size:12px">Месяц</button>
              <button data-p="quarter" class="${period === 'quarter' ? 'on' : ''}" style="padding:3px 8px;font-size:12px">Квартал</button>
              <button data-p="year" class="${period === 'year' ? 'on' : ''}" style="padding:3px 8px;font-size:12px">Год</button>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span style="font-size:12px;color:var(--mut)">С:</span>
            <input type="date" id="vhDateFrom" value="${dateFrom}" style="padding:3px 6px;font-size:12px">
            <span style="font-size:12px;color:var(--mut)">По:</span>
            <input type="date" id="vhDateTo" value="${dateTo}" style="padding:3px 6px;font-size:12px">
            ${(dateFrom || dateTo) ? `<button class="btn sm" id="vhClearDates" style="font-size:11px;padding:2px 6px">✕</button>` : ''}
          </div>
        </div>

        <!-- Mini Charts Grid -->
        <div style="font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px">
          <span>Динамика прогресса по этапам</span>
          <span class="mono" style="font-weight:400;color:var(--mut);font-size:12px">(${S.stages.length} этапов)</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:12px">
          ${stageChartsHtml}
        </div>

        <!-- Detailed History Log Table -->
        <div style="margin-top:8px">
          <div class="v-section-title">Хронологический журнал изменений (${sortedHistDesc.length})</div>
          <div style="max-height:260px;overflow-y:auto;border:1px solid var(--line2);border-radius:8px">
            <table class="mini-t hist" style="margin:0">
              <thead>
                <tr style="background:#F8F9F4">
                  <td style="font-weight:700;width:150px">Дата / Время</td>
                  <td style="font-weight:700">Этап</td>
                  <td style="font-weight:700">Прогресс</td>
                  <td style="font-weight:700;text-align:right">Дельта</td>
                </tr>
              </thead>
              <tbody>
                ${sortedHistDesc.map(x => {
                  const stgObj = (S.stages || []).find(s => s.id === x.stageId);
                  const stgName = stgObj?.name || 'Этап';
                  const delta = (x.to || 0) - (x.from || 0);
                  const deltaBadge = delta >= 0
                    ? `<span class="chip" style="background:#E6FFFA;color:#234E52;font-weight:700">+${delta}%</span>`
                    : `<span class="chip" style="background:#FED7D7;color:#9B2C2C;font-weight:700">${delta}%</span>`;
                  return `
                    <tr>
                      <td class="mono" style="color:var(--mut);font-size:11.5px">${fmtDT(x.ts)}</td>
                      <td>${stgObj ? chipHtml(stgName, colorOf(stgObj)) : esc(stgName)}</td>
                      <td class="mono" style="font-size:12px"><b>${x.from}%</b> → <b>${x.to}%</b></td>
                      <td style="text-align:right">${deltaBadge}</td>
                    </tr>
                  `;
                }).join('') || '<tr><td colspan="4" style="color:var(--mut2);padding:14px;text-align:center">История изменений этапов пуста</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    // Event listeners
    container.querySelectorAll('#vhPeriodSeg button').forEach(b => {
      b.onclick = () => {
        period = b.dataset.p;
        reDraw();
      };
    });

    const df = container.querySelector('#vhDateFrom');
    if (df) df.onchange = () => { dateFrom = df.value; reDraw(); };

    const dt = container.querySelector('#vhDateTo');
    if (dt) dt.onchange = () => { dateTo = dt.value; reDraw(); };

    const clr = container.querySelector('#vhClearDates');
    if (clr) clr.onclick = () => { dateFrom = ''; dateTo = ''; reDraw(); };
  };

  reDraw();
}

  const descHtml = r.desc ? `<div style="margin-bottom:14px">
    <div class="v-section-title">Описание</div>
    <div style="white-space:pre-wrap;background:#F8F9F4;padding:12px 14px;border-radius:8px;border:1px solid var(--line2);font-size:13px;line-height:1.5">${esc(r.desc)}</div>
  </div>` : '';

  let lastNoteText = '';
  let lastNoteObj = null;
  if (r.notes && r.notes.length) {
    const sorted = [...r.notes].sort((a, b) => {
      const tA = a.createdAt || a.updatedAt || '';
      const tB = b.createdAt || b.updatedAt || '';
      return tA < tB ? 1 : (tA > tB ? -1 : 0);
    });
    lastNoteObj = sorted[0];
    lastNoteText = lastNoteObj?.text || '';
  } else if (r.note) {
    lastNoteText = r.note;
  }

  const noteHtml = lastNoteText ? `<div style="margin-bottom:14px">
    <div class="v-section-title" style="display:flex;align-items:center;justify-content:space-between">
      <span>Последняя заметка</span>
      ${lastNoteObj?.createdAt ? `<span class="mono" style="font-size:11px;color:var(--mut);font-weight:normal">${fmtDT(lastNoteObj.createdAt)}</span>` : ''}
    </div>
    <div style="white-space:pre-wrap;background:#FFFDF5;padding:10px 12px;border-radius:8px;border:1px solid #F6E05E;font-size:12.5px;color:#744210;word-break:break-word">${esc(lastNoteText)}</div>
  </div>` : '';

  const chkDoneCount = (r.checklists || []).filter(c => c.done).length;
  const chkTotalCount = (r.checklists || []).length;
  const notesCount = (r.notes || []).length;

  const body = `
    ${breadcrumbHtml}
    <div style="padding:16px 20px">
      ${heroHtml}
      ${statsGrid}

      <div class="ftabs" id="vtabs" style="padding:0;margin-bottom:14px">
        <button class="on" data-vt="main">Основное</button>
        ${kidsHtml ? `<button data-vt="kids">Связи / Дочерние</button>` : ''}
        ${isMainEnt ? `<button data-vt="checklists" id="vTabChkBtn">Чек-лист (${chkDoneCount}/${chkTotalCount})</button>` : ''}
        ${isMainEnt ? `<button data-vt="notes" id="vTabNotesBtn">Заметки (${notesCount})</button>` : ''}
        ${histHtml ? `<button data-vt="hist">История этапов</button>` : ''}
      </div>

      <div id="vbody">
        <div id="vt-main" class="fgrid" style="display:grid;grid-template-columns:repeat(12,1fr);gap:14px 16px;align-items:start">
          ${stagesEditHtml ? `<div data-field="stageed" class="full">${stagesEditHtml}</div>` : ''}
          <div data-field="details" class="full">${detailsHtml}</div>
          ${descHtml ? `<div data-field="desc" class="full">${descHtml}</div>` : ''}
          ${noteHtml ? `<div data-field="note" class="full">${noteHtml}</div>` : ''}
        </div>
        ${kidsHtml ? `<div id="vt-kids" class="hidden">${kidsHtml}</div>` : ''}
        ${isMainEnt ? `<div id="vt-checklists" class="hidden"></div>` : ''}
        ${isMainEnt ? `<div id="vt-notes" class="hidden"></div>` : ''}
        ${histHtml ? `<div id="vt-hist" class="hidden">${histHtml}</div>` : ''}
      </div>
    </div>`;

  const defaultViewFields = [
    { id: 'stageed', label: 'Прогресс по этапам', width: 100 },
    { id: 'details', label: 'Основные параметры', width: 100 },
    { id: 'desc', label: 'Описание', width: 100 },
    { id: 'note', label: 'Последняя заметка', width: 100 }
  ];

  modal({
    title: esc(r.name),
    sub: `${entTitle.toUpperCase()} · ${r.num || ('ID ' + r.id)}`,
    wide: true,
    body,
    foot: `
      <button type="button" class="btn sm" id="btnCustViewLayout" style="margin-right:auto">Настроить секции</button>
      ${stack.length > 1 ? `<button class="btn" id="vFootBack">Назад</button>` : ''}
      <button class="btn" data-edit>Редактировать</button>
      <button class="btn pri" data-x>Закрыть</button>
    `,
    mount(box) {
      const mainEl = box.el.querySelector('#vt-main');
      const formKey = `viewForm_${cEnt}`;
      const designer = enableInteractiveFormDesigner(S, formKey, mainEl, defaultViewFields);

      const btnCust = box.el.querySelector('#btnCustViewLayout');
      if (btnCust) {
        btnCust.onclick = () => {
          designer.toggle();
        };
      }

      // Checklists & Notes rendering
      if (isMainEnt) {
        const chkWrap = box.el.querySelector('#vt-checklists');
        const notesWrap = box.el.querySelector('#vt-notes');
        const tabChkBtn = box.el.querySelector('#vTabChkBtn');
        const tabNotesBtn = box.el.querySelector('#vTabNotesBtn');

        const onBadgeUpdateChk = (done, total) => {
          if (tabChkBtn) tabChkBtn.textContent = `Чек-лист (${done}/${total})`;
        };
        const onBadgeUpdateNotes = (total) => {
          if (tabNotesBtn) tabNotesBtn.textContent = `Заметки (${total})`;
        };

        if (chkWrap) renderViewChecklists(chkWrap, S, r, cEnt, callbacks, onBadgeUpdateChk);
        if (notesWrap) renderViewNotes(notesWrap, S, r, cEnt, callbacks, onBadgeUpdateNotes);
      }

      // Tab switching
      box.el.querySelectorAll('#vtabs button').forEach(btn => btn.onclick = () => {
        box.el.querySelectorAll('#vtabs button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
        const vt = btn.dataset.vt;
        const mainEl = box.el.querySelector('#vt-main');
        const kidsEl = box.el.querySelector('#vt-kids');
        const chkEl = box.el.querySelector('#vt-checklists');
        const notesEl = box.el.querySelector('#vt-notes');
        const histEl = box.el.querySelector('#vt-hist');

        if (mainEl) mainEl.classList.toggle('hidden', vt !== 'main');
        if (kidsEl) kidsEl.classList.toggle('hidden', vt !== 'kids');
        if (chkEl) chkEl.classList.toggle('hidden', vt !== 'checklists');
        if (notesEl) notesEl.classList.toggle('hidden', vt !== 'notes');
        if (histEl) {
          histEl.classList.toggle('hidden', vt !== 'hist');
          if (vt === 'hist' && cEnt === 'projects') {
            renderProjectStageHistoryView(histEl, S, r);
          }
        }
      });

      // Direct Stage Progress sliders + numeric inputs with top [Применить] and [Отменить] buttons
      if (cEnt === 'projects') {
        const baselineVal = {};
        (S.stages || []).forEach(st => {
          baselineVal[st.id] = (r.stageProgress && r.stageProgress[st.id] !== undefined) ? r.stageProgress[st.id] : 0;
        });

        const btnApply = box.el.querySelector('#btnApplyStagesProgress');
        const btnCancel = box.el.querySelector('#btnCancelStagesProgress');

        const checkChangesState = () => {
          let hasChanges = false;
          (S.stages || []).forEach(st => {
            const curVal = r.stageProgress ? (r.stageProgress[st.id] || 0) : 0;
            const origVal = baselineVal[st.id] !== undefined ? baselineVal[st.id] : 0;
            if (curVal !== origVal) hasChanges = true;
          });

          if (btnApply) btnApply.style.display = hasChanges ? 'inline-flex' : 'none';
          if (btnCancel) btnCancel.style.display = hasChanges ? 'inline-flex' : 'none';
        };

        const onStageInput = (stId, rawVal) => {
          let val = Math.max(0, Math.min(100, parseInt(rawVal, 10) || 0));
          const rInput = box.el.querySelector(`input[data-vsp="${stId}"]`);
          const nInput = box.el.querySelector(`input[data-vspnum="${stId}"]`);
          if (rInput && +rInput.value !== val) rInput.value = val;
          if (nInput && +nInput.value !== val) nInput.value = val;

          r.stageProgress = r.stageProgress || {};
          r.stageProgress[stId] = val;

          // Recalculate total progress visually in header
          if (S.stages && S.stages.length) {
            const newTotal = Math.round(S.stages.reduce((sum, s) => sum + (r.stageProgress[s.id] || 0), 0) / S.stages.length);
            const bar = box.el.querySelector('#vHeaderProgBar');
            const txt = box.el.querySelector('#vHeaderProgVal');
            if (bar) bar.style.width = newTotal + '%';
            if (txt) txt.textContent = newTotal + '%';
          }

          checkChangesState();
        };

        box.el.querySelectorAll('input[data-vsp]').forEach(slider => {
          slider.oninput = () => onStageInput(slider.dataset.vsp, slider.value);
        });

        box.el.querySelectorAll('input[data-vspnum]').forEach(numInp => {
          numInp.oninput = () => onStageInput(numInp.dataset.vspnum, numInp.value);
        });

        if (btnApply) {
          btnApply.onclick = async () => {
            try {
              r.updatedAt = nowIso();
              await db.projects.put(r);

              let changedCount = 0;
              for (const st of (S.stages || [])) {
                const fromVal = baselineVal[st.id] !== undefined ? baselineVal[st.id] : 0;
                const toVal = r.stageProgress ? (r.stageProgress[st.id] || 0) : 0;
                if (fromVal !== toVal) {
                  await db.stageHistory.add({
                    projectId: r.id,
                    ts: nowIso(),
                    stageId: st.id,
                    from: fromVal,
                    to: toVal
                  });
                  baselineVal[st.id] = toVal;
                  changedCount++;
                }
              }

              checkChangesState();
              await refreshAll(S);
              if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
              toast('Прогресс по этапам успешно сохранён', 'ok');
            } catch (e) {
              toast('Ошибка сохранения этапов: ' + e.message, 'err');
            }
          };
        }

        if (btnCancel) {
          btnCancel.onclick = () => {
            (S.stages || []).forEach(st => {
              const orig = baselineVal[st.id] !== undefined ? baselineVal[st.id] : 0;
              r.stageProgress = r.stageProgress || {};
              r.stageProgress[st.id] = orig;

              const rInput = box.el.querySelector(`input[data-vsp="${st.id}"]`);
              const nInput = box.el.querySelector(`input[data-vspnum="${st.id}"]`);
              if (rInput) rInput.value = orig;
              if (nInput) nInput.value = orig;
            });

            if (S.stages && S.stages.length) {
              const origTotal = Math.round(S.stages.reduce((sum, s) => sum + (r.stageProgress[s.id] || 0), 0) / S.stages.length);
              const bar = box.el.querySelector('#vHeaderProgBar');
              const txt = box.el.querySelector('#vHeaderProgVal');
              if (bar) bar.style.width = origTotal + '%';
              if (txt) txt.textContent = origTotal + '%';
            }

            checkChangesState();
            toast('Изменения этапов отменены', 'info');
          };
        }
      }

      // Close & Edit actions
      box.el.querySelector('[data-x]').onclick = () => box.close();
      box.el.querySelector('[data-edit]').onclick = () => {
        box.close();
        if (isMainEnt) {
          if (callbacks.onEdit) callbacks.onEdit(cEnt, cId);
        } else {
          if (callbacks.onEditDir) callbacks.onEditDir(cEnt, cId);
        }
      };

      // Quick Change Button
      const quickBtn = box.el.querySelector('#vBtnQuickChange');
      if (quickBtn) {
        quickBtn.onclick = () => {
          openQuickChangeModal(S, cEnt, cId, {
            autoSave: callbacks.autoSave,
            onSuccess: () => {
              box.close();
              openViewModal(S, cEnt, cId, callbacks, stack);
            }
          });
        };
      }

      // Duplicate Button
      const dupBtn = box.el.querySelector('#vBtnDuplicate');
      if (dupBtn) {
        dupBtn.onclick = () => {
          box.close();
          duplicateRecord(S, cEnt, cId, callbacks.autoSave);
        };
      }

      // Add Sub Task Button
      const addSubTaskBtn = box.el.querySelector('#vBtnAddSubTask');
      if (addSubTaskBtn) {
        addSubTaskBtn.onclick = () => {
          box.close();
          createSubItem(S, 'projects', cId, 'tasks', callbacks);
        };
      }
      const addSubTaskInTab = box.el.querySelector('#vBtnAddSubTaskInTab');
      if (addSubTaskInTab) {
        addSubTaskInTab.onclick = () => {
          box.close();
          createSubItem(S, 'projects', cId, 'tasks', callbacks);
        };
      }

      // Add Sub Change Button
      const addSubChangeBtn = box.el.querySelector('#vBtnAddSubChange');
      if (addSubChangeBtn) {
        addSubChangeBtn.onclick = () => {
          box.close();
          createSubItem(S, 'tasks', cId, 'changes', callbacks);
        };
      }
      const addSubChangeInTab = box.el.querySelector('#vBtnAddSubChangeInTab');
      if (addSubChangeInTab) {
        addSubChangeInTab.onclick = () => {
          box.close();
          createSubItem(S, 'tasks', cId, 'changes', callbacks);
        };
      }

      // Copy Code Button
      const copyBtn = box.el.querySelector('#vBtnCopyCode');
      if (copyBtn) {
        copyBtn.onclick = () => {
          const str = r.num ? `${r.num} · ${r.name}` : r.name;
          navigator.clipboard.writeText(str);
          toast('Скопировано: ' + str, 'ok');
        };
      }

      // Back navigation button ("Назад")
      const backNav = () => {
        if (stack.length > 1) {
          box.close();
          const newStack = stack.slice(0, stack.length - 1);
          openViewModal(S, newStack[newStack.length - 1].ent, newStack[newStack.length - 1].id, callbacks, newStack);
        }
      };

      const btnBackTop = box.el.querySelector('#vBtnBack');
      const btnBackFoot = box.el.querySelector('#vFootBack');
      if (btnBackTop) btnBackTop.onclick = backNav;
      if (btnBackFoot) btnBackFoot.onclick = backNav;

      // Clickable Breadcrumbs
      box.el.querySelectorAll('.v-step.link[data-stackidx]').forEach(btn => {
        btn.onclick = () => {
          const idx = +btn.dataset.stackidx;
          const newStack = stack.slice(0, idx + 1);
          const target = newStack[newStack.length - 1];
          box.close();
          openViewModal(S, target.ent, target.id, callbacks, newStack);
        };
      });

      // Clickable Parents in stats
      const linkCustomer = box.el.querySelector('#vLinkCustomer');
      if (linkCustomer && cs) {
        linkCustomer.onclick = () => {
          box.close();
          openViewModal(S, 'customers', cs.id, callbacks, [...stack, { ent: 'customers', id: cs.id }]);
        };
      }
      const linkParentPj = box.el.querySelector('#vLinkParentPj');
      if (linkParentPj && pj) {
        linkParentPj.onclick = () => {
          box.close();
          openViewModal(S, 'projects', pj.id, callbacks, [...stack, { ent: 'projects', id: pj.id }]);
        };
      }
      const linkParentTk = box.el.querySelector('#vLinkParentTk');
      if (linkParentTk && tk) {
        linkParentTk.onclick = () => {
          box.close();
          openViewModal(S, 'tasks', tk.id, callbacks, [...stack, { ent: 'tasks', id: tk.id }]);
        };
      }

      // Clickable Sub-Items (Tasks, Changes, Projects)
      box.el.querySelectorAll('tr[data-tid]').forEach(tr => tr.onclick = () => {
        const tid = +tr.dataset.tid;
        box.close();
        openViewModal(S, 'tasks', tid, callbacks, [...stack, { ent: 'tasks', id: tid }]);
      });

      box.el.querySelectorAll('tr[data-cid]').forEach(tr => tr.onclick = () => {
        const cid = +tr.dataset.cid;
        box.close();
        openViewModal(S, 'changes', cid, callbacks, [...stack, { ent: 'changes', id: cid }]);
      });

      box.el.querySelectorAll('tr[data-pid]').forEach(tr => tr.onclick = () => {
        const pid = +tr.dataset.pid;
        box.close();
        openViewModal(S, 'projects', pid, callbacks, [...stack, { ent: 'projects', id: pid }]);
      });
    }
  });
}

// src/pages/reports.js
import { esc } from '../utils/dom.js';
import { fmtD, fmtDT } from '../utils/date.js';
import { colorOf, tint } from '../utils/color.js';
import { statFor, pri, emp, prj, tsk, stg } from '../services/refs.js';
import { chipHtml } from '../components/table/renderers.js';
import { toast } from '../ui/toast.js';
import { modal, confirmBox } from '../ui/modal.js';
import { popover } from '../ui/popover.js';
import { db, refreshAll } from '../core/db.js';
import { savePrefs } from '../core/prefs.js';
import { afterChange } from '../utils/logger.js';
import { renderUnifiedHeader } from '../ui/unifiedHeader.js';

let filterState = {
  module: 'projects',
  dateFrom: '',
  dateTo: '',
  statuses: [],     // Array of selected status IDs
  priorities: [],   // Array of selected priority IDs
  customers: [],    // Array of selected customer IDs
  devs: [],         // Array of selected developer IDs
  agents: [],       // Array of selected agent IDs
  search: ''
};

let isEditLayoutMode = false;

let stageDynFilter = {
  period: 'day', // 'day' | 'month' | 'quarter' | 'year'
  projectId: null, // null = all projects
  stageId: null // null = all stages
};

// Default dashboard widgets configuration
const DEFAULT_WIDGETS = [
  { id: 'kpi_cards', title: 'Сводные показатели KPI', width: 'w-12', visible: true },
  { id: 'status_chart', title: 'Распределение по статусам', width: 'w-6', visible: true },
  { id: 'priority_chart', title: 'Распределение по приоритетам', width: 'w-6', visible: true },
  { id: 'stages_progress', title: 'Средний прогресс по этапам (%)', width: 'w-12', visible: true },
  { id: 'stage_dynamics', title: 'Общая динамика по этапам проектов', width: 'w-12', visible: true },
  { id: 'dev_workload', title: 'Загрузка разработчиков', width: 'w-6', visible: true },
  { id: 'agent_workload', title: 'Загрузка агентов (ПМ / Аналитики)', width: 'w-6', visible: true },
  { id: 'customer_dist', title: 'Распределение по заказчикам', width: 'w-12', visible: true },
  { id: 'drill_table', title: 'Детализированный реестр данных', width: 'w-12', visible: true }
];

function getLayoutConfig(S) {
  if (S.prefs && S.prefs.reportsLayout && Array.isArray(S.prefs.reportsLayout) && S.prefs.reportsLayout.length) {
    return S.prefs.reportsLayout;
  }
  return JSON.parse(JSON.stringify(DEFAULT_WIDGETS));
}

export function renderReportsPage(S, mount, callbacks = {}) {
  const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };

  // Ensure selected module is allowed
  if (filterState.module === 'projects' && !mods.projects) {
    filterState.module = mods.tasks ? 'tasks' : (mods.changes ? 'changes' : 'projects');
  } else if (filterState.module === 'tasks' && !mods.tasks) {
    filterState.module = mods.projects ? 'projects' : (mods.changes ? 'changes' : 'projects');
  } else if (filterState.module === 'changes' && !mods.changes) {
    filterState.module = mods.projects ? 'projects' : (mods.tasks ? 'tasks' : 'projects');
  }

  // 1. Filter dataset according to multi-select slicers
  const ent = filterState.module;
  let items = S[ent] || [];

  if (filterState.search) {
    const q = filterState.search.toLowerCase();
    items = items.filter(x => (x.name || '').toLowerCase().includes(q) || (x.num || '').toLowerCase().includes(q));
  }
  if (filterState.statuses && filterState.statuses.length) {
    items = items.filter(x => filterState.statuses.includes(x.statusId));
  }
  if (filterState.priorities && filterState.priorities.length) {
    items = items.filter(x => filterState.priorities.includes(x.priorityId));
  }
  if (filterState.customers && filterState.customers.length) {
    items = items.filter(x => filterState.customers.includes(x.customerId));
  }
  if (filterState.devs && filterState.devs.length) {
    items = items.filter(x => filterState.devs.includes(x.devId) || (x.devs || []).some(did => filterState.devs.includes(did)));
  }
  if (filterState.agents && filterState.agents.length) {
    items = items.filter(x => filterState.agents.includes(x.agentId) || (x.agents || []).some(aid => filterState.agents.includes(aid)));
  }
  if (filterState.dateFrom) {
    items = items.filter(x => (x.start || x.createdAt || '').slice(0, 10) >= filterState.dateFrom);
  }
  if (filterState.dateTo) {
    items = items.filter(x => (x.end || x.createdAt || '').slice(0, 10) <= filterState.dateTo);
  }

  // 2. Metrics & KPI calculations
  const totalCount = items.length;
  const todayIso = new Date().toISOString().slice(0, 10);
  const overdueCount = items.filter(x => x.end && x.end < todayIso).length;

  let avgProgress = 0;
  if (ent === 'projects' && S.stages && S.stages.length && items.length) {
    const totalProgSum = items.reduce((acc, p) => {
      const pSum = S.stages.reduce((sAcc, st) => sAcc + (p.stageProgress ? (p.stageProgress[st.id] || 0) : 0), 0);
      return acc + (pSum / S.stages.length);
    }, 0);
    avgProgress = Math.round(totalProgSum / items.length);
  }

  const activeDevs = new Set();
  items.forEach(x => {
    if (x.devId) activeDevs.add(x.devId);
    (x.devs || []).forEach(d => activeDevs.add(d));
  });

  // 3. Status breakdown
  const statusCounts = {};
  const statusDict = ent === 'projects' ? (S.projectStatuses || []) : (S.taskStatuses || []);
  statusDict.forEach(st => statusCounts[st.id] = 0);
  items.forEach(x => {
    if (x.statusId && statusCounts[x.statusId] !== undefined) {
      statusCounts[x.statusId]++;
    }
  });

  // 4. Priority breakdown
  const priCounts = {};
  (S.priorities || []).forEach(pr => priCounts[pr.id] = 0);
  items.forEach(x => {
    if (x.priorityId && priCounts[x.priorityId] !== undefined) {
      priCounts[x.priorityId]++;
    }
  });

  // 5. Developer workload breakdown
  const devWorkload = {};
  const devsList = (S.employees || []).filter(e => e.role === 'dev');
  devsList.forEach(e => devWorkload[e.id] = 0);
  items.forEach(x => {
    if (x.devId && devWorkload[x.devId] !== undefined) devWorkload[x.devId]++;
    (x.devs || []).forEach(did => {
      if (devWorkload[did] !== undefined) devWorkload[did]++;
    });
  });

  // 6. PM / Agent workload breakdown
  const agentWorkload = {};
  const agentsList = (S.employees || []).filter(e => e.role === 'agent');
  agentsList.forEach(e => agentWorkload[e.id] = 0);
  items.forEach(x => {
    if (x.agentId && agentWorkload[x.agentId] !== undefined) agentWorkload[x.agentId]++;
    (x.agents || []).forEach(aid => {
      if (agentWorkload[aid] !== undefined) agentWorkload[aid]++;
    });
  });

  // 7. Customer project distribution
  const custWorkload = {};
  const custsList = S.customers || [];
  custsList.forEach(c => custWorkload[c.id] = 0);
  items.forEach(x => {
    if (x.customerId && custWorkload[x.customerId] !== undefined) custWorkload[x.customerId]++;
  });

  // 8. Stage breakdown for projects
  const stageStats = (S.stages || []).map(st => {
    let sumVal = 0;
    items.forEach(p => {
      sumVal += (p.stageProgress ? (p.stageProgress[st.id] || 0) : 0);
    });
    const avg = items.length ? Math.round(sumVal / items.length) : 0;
    return { id: st.id, name: st.name, color: st.color || '#3B82F6', avg };
  });

  // Helpers for Chart HTML
  const renderHBar = (label, count, maxCount, color = '#3182CE', extraText = '') => {
    const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
    return `<div class="hbar-row">
      <span class="hbar-label" title="${esc(label)}">${esc(label)}</span>
      <div class="hbar-track">
        <div class="hbar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      <span class="hbar-val">${extraText || count}</span>
    </div>`;
  };

  const renderDonutChart = (data, total) => {
    const nonZero = (data || []).filter(d => d.value > 0);
    if (!total || total <= 0 || !nonZero.length) {
      return `<div style="color:var(--mut2);text-align:center;padding:24px">Нет данных для диаграммы</div>`;
    }
    const size = 130;
    const strokeWidth = 24;
    const radius = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * radius;
    let offset = 0;

    const slices = nonZero.map(d => {
      const sliceLength = (d.value / total) * circ;
      const strokeDasharray = `${sliceLength} ${circ - sliceLength}`;
      const strokeDashoffset = -offset;
      offset += sliceLength;
      return `<circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${d.color}" stroke-width="${strokeWidth}" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}"></circle>`;
    }).join('');

    const legendHtml = nonZero.map(d => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${d.color}"></span>
        <span style="flex:1">${esc(d.name)}</span>
        <b class="mono">${d.value} (${Math.round((d.value/total)*100)}%)</b>
      </div>
    `).join('');

    return `<div class="donut-wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg);flex-shrink:0">
        ${slices}
      </svg>
      <div class="donut-legend">${legendHtml}</div>
    </div>`;
  };

  const statusData = statusDict.map(st => ({ name: st.name, color: st.color || '#999', value: statusCounts[st.id] || 0 }));
  const priData = (S.priorities || []).map(pr => ({ name: pr.name, color: pr.color || '#999', value: priCounts[pr.id] || 0 }));

  // Dynamic Widget Renderer Map
  const widgetsMap = {
    kpi_cards: () => `
      <div class="kpi-grid" style="width:100%">
        <div class="kpi-card blue">
          <div class="kpi-title">Всего записей (${ent === 'projects' ? 'Проекты' : (ent === 'tasks' ? 'Задачи' : 'Изменения')})</div>
          <div class="kpi-value">${totalCount}</div>
          <div class="kpi-sub">В текущей выборке</div>
        </div>
        ${ent === 'projects' ? `
        <div class="kpi-card green">
          <div class="kpi-title">Средний прогресс по этапам</div>
          <div class="kpi-value">${avgProgress}%</div>
          <div class="kpi-sub">По всем этапам выборки</div>
        </div>` : ''}
        <div class="kpi-card ${overdueCount > 0 ? 'red' : 'green'}">
          <div class="kpi-title">Просрочено по срокам</div>
          <div class="kpi-value">${overdueCount}</div>
          <div class="kpi-sub">${overdueCount === 0 ? 'Все в графике' : 'Требуют внимания'}</div>
        </div>
        <div class="kpi-card purple">
          <div class="kpi-title">Активных разработчиков</div>
          <div class="kpi-value">${activeDevs.size}</div>
          <div class="kpi-sub">Задействованы в выборке</div>
        </div>
      </div>`,

    status_chart: () => `
      <div class="chart-head"><h3>📊 Распределение по статусам</h3></div>
      <div class="chart-body">${renderDonutChart(statusData, totalCount)}</div>`,

    priority_chart: () => `
      <div class="chart-head"><h3>🎯 Распределение по приоритетам</h3></div>
      <div class="chart-body">${renderDonutChart(priData, totalCount)}</div>`,

    stages_progress: () => ent === 'projects' && S.stages && S.stages.length ? `
      <div class="chart-head"><h3>📈 Средний прогресс по каждому этапу проектов (названия и %)</h3></div>
      <div class="chart-body">${stageStats.map(s => renderHBar(s.name, s.avg, 100, s.color, `${s.avg}%`)).join('')}</div>` : '',

    dev_workload: () => `
      <div class="chart-head"><h3>👥 Загрузка разработчиков</h3></div>
      <div class="chart-body">${devsList.map(d => renderHBar(d.name, devWorkload[d.id] || 0, Math.max(1, ...Object.values(devWorkload)), colorOf(d))).join('') || '<div style="color:var(--mut2);text-align:center">Нет разработчиков</div>'}</div>`,

    agent_workload: () => `
      <div class="chart-head"><h3>👔 Загрузка агентов (ПМ / Аналитики)</h3></div>
      <div class="chart-body">${agentsList.map(a => renderHBar(a.name, agentWorkload[a.id] || 0, Math.max(1, ...Object.values(agentWorkload)), colorOf(a))).join('') || '<div style="color:var(--mut2);text-align:center">Нет агентов</div>'}</div>`,

    customer_dist: () => `
      <div class="chart-head"><h3>🏢 Распределение по заказчикам</h3></div>
      <div class="chart-body">${custsList.map(c => renderHBar(c.name, custWorkload[c.id] || 0, Math.max(1, ...Object.values(custWorkload)), '#0B7285')).join('') || '<div style="color:var(--mut2);text-align:center">Нет заказчиков</div>'}</div>`,

    stage_dynamics: () => ent === 'projects' ? renderStageDynamicsDiagram(S, items) : '',

    drill_table: () => `
      <div class="drill-table-head">
        <h3>📋 Детализированный реестр данных (${items.length})</h3>
        <span style="font-size:12px;color:var(--mut)">Кликните на строку для перехода в карточку</span>
      </div>
      <div style="overflow-x:auto;max-height:480px">
        <table class="tbl" style="width:100%">
          <thead>
            <tr style="background:#F6F7F2">
              <th style="width:80px">Код</th>
              <th>Название</th>
              <th>Заказчик</th>
              <th>Статус</th>
              <th>Приоритет</th>
              ${ent === 'projects' ? '<th>Прогресс этапов</th>' : ''}
              ${ent === 'tasks' && mods.projects ? '<th>Проект</th>' : ''}
              ${ent === 'changes' && mods.tasks ? '<th>Задача</th>' : ''}
              <th>Разработчик</th>
              <th>Сроки</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(r => {
              const st = statFor(S, ent, r.statusId);
              const pr = pri(S, r.priorityId);
              const dv = emp(S, r.devId);
              const cs = (S.customers || []).find(c => c.id === r.customerId);
              const pj = prj(S, r.projectId);
              const tk = tsk(S, r.taskId);

              let progVal = 0;
              if (ent === 'projects' && S.stages && S.stages.length) {
                const sSum = S.stages.reduce((acc, s) => acc + (r.stageProgress ? (r.stageProgress[s.id] || 0) : 0), 0);
                progVal = Math.round(sSum / S.stages.length);
              }

              return `<tr class="rw" data-view-id="${r.id}" style="cursor:pointer">
                <td><b class="mono" style="color:var(--acc)">${esc(r.num)}</b></td>
                <td><b>${esc(r.name)}</b></td>
                <td>${cs ? esc(cs.name) : '—'}</td>
                <td>${st ? chipHtml(st.name, colorOf(st)) : '—'}</td>
                <td>${pr ? chipHtml(pr.name, colorOf(pr)) : '—'}</td>
                ${ent === 'projects' ? `<td><div class="progwrap"><div class="progbar" style="width:80px"><i style="width:${progVal}%"></i></div><span class="mono">${progVal}%</span></div></td>` : ''}
                ${ent === 'tasks' && mods.projects ? `<td>${pj ? esc(pj.name) : '—'}</td>` : ''}
                ${ent === 'changes' && mods.tasks ? `<td>${tk ? esc(tk.name) : '—'}</td>` : ''}
                <td>${dv ? chipHtml(dv.name, colorOf(dv)) : '—'}</td>
                <td class="mono" style="font-size:12px">${fmtD(r.start)} → ${fmtD(r.end)}</td>
              </tr>`;
            }).join('') || '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--mut2)">Нет данных, удовлетворяющих срезам</td></tr>'}
          </tbody>
        </table>
      </div>`
  };

  const layoutWidgets = getLayoutConfig(S);

  // Helper for multi-select slicer trigger button text
  const getMultiBtnLabel = (selIds, allItems, defaultLabel) => {
    if (!selIds || !selIds.length) return defaultLabel;
    if (selIds.length === allItems.length) return `Все (${allItems.length})`;
    if (selIds.length === 1) {
      const it = allItems.find(x => x.id === selIds[0]);
      return it ? it.name : defaultLabel;
    }
    return `Выбрано: ${selIds.length}`;
  };

  const activeFiltersCount = (filterState.statuses.length ? 1 : 0) +
    (filterState.priorities.length ? 1 : 0) +
    (filterState.customers.length ? 1 : 0) +
    (filterState.devs.length ? 1 : 0) +
    (filterState.agents.length ? 1 : 0) +
    (filterState.dateFrom ? 1 : 0) +
    (filterState.dateTo ? 1 : 0) +
    (filterState.search ? 1 : 0) +
    (S.search ? 1 : 0);

  const resetFiltersBtnHtml = activeFiltersCount > 0 ? `
    <button class="btn sm" id="btnResetFilters" style="display:inline-flex;align-items:center;gap:6px;background:#FFF5F5;border-color:#FEB2B2;color:#C53030;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>
      Применено фильтров: ${activeFiltersCount}
      <span style="font-weight:800;margin-left:2px;font-size:12px">✕ Сбросить</span>
    </button>
  ` : `
    <button class="btn sm" id="btnResetFilters">Сбросить фильтры</button>
  `;

  const headerHtml = renderUnifiedHeader(S, {
    title: 'Отчёты / BI',
    count: totalCount,
    actions: `
      <button class="btn sm ${isEditLayoutMode ? 'pri' : ''}" id="btnToggleEditLayout" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        ${isEditLayoutMode ? 'Сохранить раскладку' : 'Настроить дашборд'}
      </button>
      <button class="btn sm" id="btnExportCsv" title="Экспорт отчёта в CSV" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Экспорт CSV
      </button>
      ${resetFiltersBtnHtml}
    `
  });

  mount.innerHTML = `
    ${headerHtml}
    <div class="page-content scrollable" style="padding-top:10px">
      <div class="reports-container ${isEditLayoutMode ? 'editing-dashboard' : ''}">
      ${isEditLayoutMode ? `
      <div class="reports-edit-toolbar">
        <div style="font-size:13px;font-weight:700;color:#92400E;display:flex;align-items:center;gap:6px">
          <span>Режим настройки дашборда:</span>
          <span style="font-weight:400">перетаскивайте блоки за ручку <b>⋮⋮</b>, меняйте ширину или скрывайте виджеты.</span>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn sm" id="btnResetLayoutDefault">Сбросить раскладку</button>
          <button class="btn sm pri" id="btnSaveLayoutModal">Сохранить...</button>
        </div>
      </div>` : ''}

      <!-- Slicers / Interactive Filters (Срезы с чекбоксами) -->
      <div class="slicers-card">
        <div class="slicers-header">
          <div class="slicers-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
            Интерактивные срезы и фильтры
          </div>
          <div class="seg" id="reportModuleSeg">
            ${mods.projects ? `<button data-mod="projects" class="${filterState.module === 'projects' ? 'on' : ''}">Проекты</button>` : ''}
            ${mods.tasks ? `<button data-mod="tasks" class="${filterState.module === 'tasks' ? 'on' : ''}">Задачи</button>` : ''}
            ${mods.changes ? `<button data-mod="changes" class="${filterState.module === 'changes' ? 'on' : ''}">Изменения</button>` : ''}
          </div>
        </div>
        <div class="slicers-grid">
          <div class="slicer-item">
            <span class="slicer-label">Поиск</span>
            <input type="text" class="slicer-input" id="repSearch" placeholder="Номер или текст..." value="${esc(filterState.search)}">
          </div>
          <div class="slicer-item">
            <span class="slicer-label">Статусы</span>
            <button class="slicer-multiselect-btn" id="btnSlicerStatus">
              <span>${esc(getMultiBtnLabel(filterState.statuses, statusDict, '— Все статусы —'))}</span>
              ${filterState.statuses.length ? `<span class="badge">${filterState.statuses.length}</span>` : '<span>▾</span>'}
            </button>
          </div>
          <div class="slicer-item">
            <span class="slicer-label">Приоритеты</span>
            <button class="slicer-multiselect-btn" id="btnSlicerPriority">
              <span>${esc(getMultiBtnLabel(filterState.priorities, S.priorities || [], '— Все приоритеты —'))}</span>
              ${filterState.priorities.length ? `<span class="badge">${filterState.priorities.length}</span>` : '<span>▾</span>'}
            </button>
          </div>
          <div class="slicer-item">
            <span class="slicer-label">Заказчики</span>
            <button class="slicer-multiselect-btn" id="btnSlicerCustomer">
              <span>${esc(getMultiBtnLabel(filterState.customers, custsList, '— Все заказчики —'))}</span>
              ${filterState.customers.length ? `<span class="badge">${filterState.customers.length}</span>` : '<span>▾</span>'}
            </button>
          </div>
          <div class="slicer-item">
            <span class="slicer-label">Разработчики</span>
            <button class="slicer-multiselect-btn" id="btnSlicerDev">
              <span>${esc(getMultiBtnLabel(filterState.devs, devsList, '— Все разработчики —'))}</span>
              ${filterState.devs.length ? `<span class="badge">${filterState.devs.length}</span>` : '<span>▾</span>'}
            </button>
          </div>
          <div class="slicer-item">
            <span class="slicer-label">Агенты</span>
            <button class="slicer-multiselect-btn" id="btnSlicerAgent">
              <span>${esc(getMultiBtnLabel(filterState.agents, agentsList, '— Все агенты —'))}</span>
              ${filterState.agents.length ? `<span class="badge">${filterState.agents.length}</span>` : '<span>▾</span>'}
            </button>
          </div>
          <div class="slicer-item">
            <span class="slicer-label">Дата с</span>
            <input type="date" class="slicer-input" id="repDateFrom" value="${filterState.dateFrom}">
          </div>
          <div class="slicer-item">
            <span class="slicer-label">Дата по</span>
            <input type="date" class="slicer-input" id="repDateTo" value="${filterState.dateTo}">
          </div>
        </div>
      </div>

      <!-- Customizable Dynamic Dashboard Grid -->
      <div class="dashboard-grid" id="dashboardGrid">
        ${layoutWidgets.map((w, index) => {
          if (!w.visible && !isEditLayoutMode) return '';
          const contentFn = widgetsMap[w.id];
          const innerHtml = contentFn ? contentFn() : '';
          if (!innerHtml && !isEditLayoutMode) return '';

          return `
            <div class="dashboard-widget ${w.width || 'w-12'} ${!w.visible ? 'widget-hidden' : ''}" data-widget-id="${w.id}" data-widget-index="${index}" draggable="${isEditLayoutMode ? 'true' : 'false'}">
              <div class="widget-edit-controls">
                <span class="widget-drag-handle" title="Перетащите для изменения порядка">⋮⋮</span>
                <span style="font-weight:700;font-size:12px;color:var(--ink);flex:1">${esc(w.title)}</span>
                <select class="slicer-select widget-width-sel" style="padding:2px 6px;font-size:11.5px">
                  <option value="w-4" ${w.width === 'w-4' ? 'selected' : ''}>1/3 (Колонка)</option>
                  <option value="w-6" ${w.width === 'w-6' ? 'selected' : ''}>1/2 (Половина)</option>
                  <option value="w-8" ${w.width === 'w-8' ? 'selected' : ''}>2/3 (Широкий)</option>
                  <option value="w-12" ${w.width === 'w-12' ? 'selected' : ''}>100% (Вся ширина)</option>
                </select>
                <button class="btn sm btn-widget-toggle-vis" style="padding:2px 8px;font-size:11px" title="${w.visible ? 'Скрыть виджет' : 'Показать виджет'}">
                  ${w.visible ? '👁️ Скрыть' : '🚫 Скрыт'}
                </button>
              </div>
              <div class="widget-content" style="${!w.visible ? 'opacity:0.4;pointer-events:none' : ''}">
                ${innerHtml}
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  // Attach Event Listeners
  const reRender = () => renderReportsPage(S, mount, callbacks);

  // Module switcher buttons
  mount.querySelectorAll('#reportModuleSeg button').forEach(btn => {
    btn.onclick = () => {
      filterState.module = btn.dataset.mod;
      filterState.statuses = [];
      reRender();
    };
  });

  // Generic multi-select popover opener
  const openMultiSelectPopover = (btnEl, title, itemsList, selectedArray, onUpdate) => {
    const isAllChecked = itemsList.length > 0 && selectedArray.length === itemsList.length;
    const popHtml = `
      <div class="pt">${esc(title)}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0 8px;border-bottom:1px solid var(--line2);margin-bottom:6px">
        <label class="pi" style="font-weight:700;color:var(--acc)">
          <input type="checkbox" id="popChkAll" ${isAllChecked ? 'checked' : ''}>
          <span>Выбрать всё</span>
        </label>
        <button class="btn sm" id="popBtnClear" style="font-size:11px;padding:2px 6px">Сбросить</button>
      </div>
      <div class="slicer-pop-list">
        ${itemsList.map(item => {
          const isChecked = selectedArray.includes(item.id);
          return `
            <label class="slicer-pop-item">
              <input type="checkbox" data-item-id="${item.id}" ${isChecked ? 'checked' : ''}>
              <span>${esc(item.name)}</span>
            </label>
          `;
        }).join('') || '<div style="color:var(--mut2);padding:10px;text-align:center">Нет элементов</div>'}
      </div>
    `;

    popover(btnEl, popHtml, (popEl) => {
      const chkAll = popEl.querySelector('#popChkAll');
      const btnClear = popEl.querySelector('#popBtnClear');

      if (chkAll) {
        chkAll.onchange = () => {
          if (chkAll.checked) {
            onUpdate(itemsList.map(x => x.id));
          } else {
            onUpdate([]);
          }
          reRender();
        };
      }

      if (btnClear) {
        btnClear.onclick = () => {
          onUpdate([]);
          reRender();
        };
      }

      popEl.querySelectorAll('input[data-item-id]').forEach(inp => {
        inp.onchange = () => {
          const id = +inp.dataset.itemId;
          let newSelected = [...selectedArray];
          if (inp.checked) {
            if (!newSelected.includes(id)) newSelected.push(id);
          } else {
            newSelected = newSelected.filter(x => x !== id);
          }
          onUpdate(newSelected);
          reRender();
        };
      });
    });
  };

  // Bind Multi-select Slicers
  const bindMultiSlicer = (btnId, title, itemsList, filterKey) => {
    const btn = mount.querySelector('#' + btnId);
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        openMultiSelectPopover(btn, title, itemsList, filterState[filterKey], (newSel) => {
          filterState[filterKey] = newSel;
          reRender();
        });
      };
    }
  };

  bindMultiSlicer('btnSlicerStatus', 'Фильтр по статусам', statusDict, 'statuses');
  bindMultiSlicer('btnSlicerPriority', 'Фильтр по приоритетам', S.priorities || [], 'priorities');
  bindMultiSlicer('btnSlicerCustomer', 'Фильтр по заказчикам', custsList, 'customers');
  bindMultiSlicer('btnSlicerDev', 'Фильтр по разработчикам', devsList, 'devs');
  bindMultiSlicer('btnSlicerAgent', 'Фильтр по агентам', agentsList, 'agents');

  // Search input
  const searchInp = mount.querySelector('#repSearch');
  if (searchInp) {
    searchInp.oninput = () => {
      filterState.search = searchInp.value;
      reRender();
    };
  }

  // Date filters
  const repDateFromEl = mount.querySelector('#repDateFrom');
  if (repDateFromEl) repDateFromEl.onchange = () => { filterState.dateFrom = repDateFromEl.value; reRender(); };

  const repDateToEl = mount.querySelector('#repDateTo');
  if (repDateToEl) repDateToEl.onchange = () => { filterState.dateTo = repDateToEl.value; reRender(); };

  // Reset Filters
  const btnReset = mount.querySelector('#btnResetFilters');
  if (btnReset) {
    btnReset.onclick = () => {
      filterState = {
        module: filterState.module,
        dateFrom: '', dateTo: '', statuses: [], priorities: [], customers: [], devs: [], agents: [], search: ''
      };
      S.search = '';
      const topSearch = document.querySelector('#topSearch');
      if (topSearch) topSearch.value = '';
      reRender();
      toast('Все фильтры отчётов и строка поиска сброшены', 'ok');
    };
  }

  // Edit Mode toggle button
  const btnToggleEdit = mount.querySelector('#btnToggleEditLayout');
  if (btnToggleEdit) {
    btnToggleEdit.onclick = () => {
      if (isEditLayoutMode) {
        openSaveLayoutModal(S, layoutWidgets, () => {
          isEditLayoutMode = false;
          reRender();
        });
      } else {
        isEditLayoutMode = true;
        reRender();
      }
    };
  }

  const btnSaveLayoutModalBtn = mount.querySelector('#btnSaveLayoutModal');
  if (btnSaveLayoutModalBtn) {
    btnSaveLayoutModalBtn.onclick = () => {
      openSaveLayoutModal(S, layoutWidgets, () => {
        isEditLayoutMode = false;
        reRender();
      });
    };
  }

  const btnResetLayout = mount.querySelector('#btnResetLayoutDefault');
  if (btnResetLayout) {
    btnResetLayout.onclick = async () => {
      confirmBox('Сбросить раскладку дашборда к стандартному виду?', async () => {
        if (!S.prefs) S.prefs = {};
        S.prefs.reportsLayout = JSON.parse(JSON.stringify(DEFAULT_WIDGETS));
        await savePrefs(S);
        toast('Раскладка сброшена', 'ok');
        reRender();
      });
    };
  }

  // Widget width change handlers
  mount.querySelectorAll('.widget-width-sel').forEach(sel => {
    sel.onchange = () => {
      const widgetEl = sel.closest('.dashboard-widget');
      const wid = widgetEl.dataset.widgetId;
      const wObj = layoutWidgets.find(w => w.id === wid);
      if (wObj) {
        wObj.width = sel.value;
        if (!S.prefs) S.prefs = {};
        S.prefs.reportsLayout = layoutWidgets;
        reRender();
      }
    };
  });

  // Widget visibility toggles
  mount.querySelectorAll('.btn-widget-toggle-vis').forEach(btn => {
    btn.onclick = () => {
      const widgetEl = btn.closest('.dashboard-widget');
      const wid = widgetEl.dataset.widgetId;
      const wObj = layoutWidgets.find(w => w.id === wid);
      if (wObj) {
        wObj.visible = !wObj.visible;
        if (!S.prefs) S.prefs = {};
        S.prefs.reportsLayout = layoutWidgets;
        reRender();
      }
    };
  });

  // Drag and Drop reordering in edit mode
  if (isEditLayoutMode) {
    let draggedWidget = null;
    mount.querySelectorAll('.dashboard-widget').forEach(wEl => {
      wEl.addEventListener('dragstart', e => {
        draggedWidget = wEl;
        e.dataTransfer.effectAllowed = 'move';
        wEl.classList.add('widget-dragging');
      });

      wEl.addEventListener('dragend', () => {
        wEl.classList.remove('widget-dragging');
        draggedWidget = null;
      });

      wEl.addEventListener('dragover', e => {
        e.preventDefault();
      });

      wEl.addEventListener('drop', e => {
        e.preventDefault();
        if (draggedWidget && draggedWidget !== wEl) {
          const fromId = draggedWidget.dataset.widgetId;
          const toId = wEl.dataset.widgetId;
          const fromIdx = layoutWidgets.findIndex(w => w.id === fromId);
          const toIdx = layoutWidgets.findIndex(w => w.id === toId);

          if (fromIdx !== -1 && toIdx !== -1) {
            const [moved] = layoutWidgets.splice(fromIdx, 1);
            layoutWidgets.splice(toIdx, 0, moved);
            if (!S.prefs) S.prefs = {};
            S.prefs.reportsLayout = layoutWidgets;
            reRender();
          }
        }
      });
    });
  }

  // Stage Dynamics period switch buttons
  mount.querySelectorAll('[data-stage-period]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      stageDynFilter.period = btn.dataset.stagePeriod;
      reRender();
    };
  });

  // Stage Dynamics project select
  const stageProjSel = mount.querySelector('#stageDynProjSel');
  if (stageProjSel) {
    stageProjSel.onchange = () => {
      stageDynFilter.projectId = stageProjSel.value ? +stageProjSel.value : null;
      reRender();
    };
  }

  // Stage Dynamics stage filter chips
  mount.querySelectorAll('[data-stage-filter]').forEach(chip => {
    chip.onclick = (e) => {
      e.stopPropagation();
      const sId = chip.dataset.stageFilter;
      stageDynFilter.stageId = sId === 'all' ? null : +sId;
      reRender();
    };
  });

  // Row click to open View Modal
  mount.querySelectorAll('tr[data-view-id]').forEach(tr => {
    tr.onclick = () => {
      const id = +tr.dataset.viewId;
      if (callbacks.onView) callbacks.onView(ent, id);
    };
  });

  // Export to CSV
  const btnExportCsv = mount.querySelector('#btnExportCsv');
  if (btnExportCsv) {
    btnExportCsv.onclick = () => {
      exportReportToCsv(S, ent, items);
    };
  }
}

// Modal to save layout (For me / For all users)
function openSaveLayoutModal(S, layoutWidgets, onSaved) {
  const body = `
    <div style="font-size:13px;color:var(--ink);margin-bottom:14px;line-height:1.5">
      Выберите область действия для новой раскладки дашборда:
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#F8F9F4;border:1px solid var(--line);border-radius:8px;cursor:pointer">
        <input type="radio" name="saveLayoutScope" value="local" checked style="margin-top:2px">
        <div>
          <b>Только для меня (в моем браузере)</b>
          <div style="font-size:12px;color:var(--mut)">Сохраняется в локальных настройках вашего браузера.</div>
        </div>
      </label>
      <label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#F8F9F4;border:1px solid var(--line);border-radius:8px;cursor:pointer">
        <input type="radio" name="saveLayoutScope" value="global" style="margin-top:2px">
        <div>
          <b>Для всех пользователей (в серверной БД)</b>
          <div style="font-size:12px;color:var(--mut)">Сохраняется в базе данных SQLite и применится по умолчанию для всех коллег.</div>
        </div>
      </label>
    </div>
  `;

  modal({
    title: 'Сохранить раскладку дашборда',
    sub: 'ОТЧЁТЫ И ДАШБОРДЫ',
    wide: false,
    body,
    foot: `<button class="btn" data-x>Отмена</button><button class="btn pri" id="btnConfirmSaveLayout">Сохранить</button>`,
    mount(box) {
      box.el.querySelector('[data-x]').onclick = () => box.close();
      const btnConfirm = box.el.querySelector('#btnConfirmSaveLayout');
      if (btnConfirm) {
        btnConfirm.onclick = async () => {
          const scope = box.el.querySelector('input[name="saveLayoutScope"]:checked')?.value || 'local';
          if (!S.prefs) S.prefs = {};
          S.prefs.reportsLayout = layoutWidgets;
          await savePrefs(S);

          if (scope === 'global') {
            try {
              await db.meta.put({ key: 'reports_layout_default', value: layoutWidgets });
              toast('Раскладка сохранена в базе для всех пользователей', 'ok');
            } catch (e) {
              toast('Ошибка сохранения в БД: ' + e.message, 'err');
            }
          } else {
            toast('Раскладка сохранена в ваших локальных настройках', 'ok');
          }

          box.close();
          if (onSaved) onSaved();
        };
      }
    }
  });
}

// Stage dynamics interactive diagram and progress history
function renderStageDynamicsDiagram(S, filteredProjects) {
  const pids = new Set(filteredProjects.map(p => p.id));
  const rawHist = (S.stageHistory && S.stageHistory.length ? S.stageHistory : S.history) || [];

  // Filter history entries by project and filters
  let hist = rawHist.filter(h => pids.has(h.projectId) && (h.to - h.from !== 0));

  if (stageDynFilter.projectId) {
    hist = hist.filter(h => h.projectId === stageDynFilter.projectId);
  }
  if (stageDynFilter.stageId) {
    hist = hist.filter(h => h.stageId === stageDynFilter.stageId);
  }
  if (filterState.dateFrom) {
    hist = hist.filter(h => (h.ts || '').slice(0, 10) >= filterState.dateFrom);
  }
  if (filterState.dateTo) {
    hist = hist.filter(h => (h.ts || '').slice(0, 10) <= filterState.dateTo);
  }

  // Sort chronological
  hist.sort((a, b) => (a.ts > b.ts ? 1 : (a.ts < b.ts ? -1 : 0)));

  // Calculate global totals
  let totalPosDelta = 0;
  let totalNegDelta = 0;
  hist.forEach(h => {
    const d = h.to - h.from;
    if (d > 0) totalPosDelta += d;
    else if (d < 0) totalNegDelta += d;
  });
  const netDelta = totalPosDelta + totalNegDelta;
  const totalOps = hist.length;

  // Stages breakdown
  const stages = S.stages || [];
  const stageStats = {};
  stages.forEach(st => {
    stageStats[st.id] = { stage: st, pos: 0, neg: 0, net: 0, count: 0 };
  });
  hist.forEach(h => {
    const d = h.to - h.from;
    if (stageStats[h.stageId]) {
      if (d > 0) stageStats[h.stageId].pos += d;
      else if (d < 0) stageStats[h.stageId].neg += d;
      stageStats[h.stageId].net += d;
      stageStats[h.stageId].count++;
    }
  });

  // Group by Period (День / Месяц / Квартал / Год)
  const bucketsMap = new Map();

  const getBucketInfo = (ts) => {
    if (!ts) return { key: 'unknown', label: '—' };
    const dateStr = ts.slice(0, 10);
    if (stageDynFilter.period === 'day') {
      return { key: dateStr, label: fmtD(dateStr) };
    }
    if (stageDynFilter.period === 'month') {
      const yr = ts.slice(0, 4);
      const mo = parseInt(ts.slice(5, 7), 10);
      const monthNames = ['', 'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
      return { key: ts.slice(0, 7), label: `${monthNames[mo] || mo} ${yr}` };
    }
    if (stageDynFilter.period === 'quarter') {
      const yr = ts.slice(0, 4);
      const mo = parseInt(ts.slice(5, 7), 10);
      const q = Math.ceil(mo / 3);
      return { key: `${yr}-Q${q}`, label: `Q${q} ${yr}` };
    }
    // year
    const yr = ts.slice(0, 4);
    return { key: yr, label: `${yr} г.` };
  };

  hist.forEach(h => {
    const { key, label } = getBucketInfo(h.ts);
    if (!bucketsMap.has(key)) {
      bucketsMap.set(key, {
        key,
        label,
        posDelta: 0,
        negDelta: 0,
        netDelta: 0,
        opsCount: 0,
        stages: {},
        items: []
      });
    }
    const b = bucketsMap.get(key);
    const d = h.to - h.from;
    if (d > 0) b.posDelta += d;
    else if (d < 0) b.negDelta += d;
    b.netDelta += d;
    b.opsCount++;
    b.items.push(h);

    if (!b.stages[h.stageId]) {
      b.stages[h.stageId] = { pos: 0, neg: 0, net: 0, count: 0 };
    }
    if (d > 0) b.stages[h.stageId].pos += d;
    else if (d < 0) b.stages[h.stageId].neg += d;
    b.stages[h.stageId].net += d;
    b.stages[h.stageId].count++;
  });

  const buckets = Array.from(bucketsMap.values());

  // Controls HTML
  const periodBtns = `
    <div class="seg" style="font-size:12px">
      <button class="${stageDynFilter.period === 'day' ? 'on' : ''}" data-stage-period="day">📅 День</button>
      <button class="${stageDynFilter.period === 'month' ? 'on' : ''}" data-stage-period="month">📆 Месяц</button>
      <button class="${stageDynFilter.period === 'quarter' ? 'on' : ''}" data-stage-period="quarter">📊 Квартал</button>
      <button class="${stageDynFilter.period === 'year' ? 'on' : ''}" data-stage-period="year">🗓️ Год</button>
    </div>
  `;

  const projectOptions = filteredProjects.map(p => `
    <option value="${p.id}" ${stageDynFilter.projectId === p.id ? 'selected' : ''}>
      ${esc(p.name)} (${esc(p.num || '')})
    </option>
  `).join('');

  const projSelect = `
    <div style="display:flex;align-items:center;gap:6px">
      <span style="font-size:11.5px;font-weight:700;color:var(--mut);text-transform:uppercase">Проект:</span>
      <select id="stageDynProjSel" class="slicer-select" style="min-width:180px;font-size:12px;padding:4px 8px">
        <option value="">— Все проекты выборки (${filteredProjects.length}) —</option>
        ${projectOptions}
      </select>
    </div>
  `;

  const kpisHtml = `
    <div class="stage-dyn-kpis">
      <div class="stage-dyn-kpi-item" style="border-left:3px solid #10B981">
        <span class="kpi-lbl">📈 Суммарный прирост</span>
        <span class="kpi-val" style="color:#059669">+${totalPosDelta}%</span>
      </div>
      <div class="stage-dyn-kpi-item" style="border-left:3px solid #EF4444">
        <span class="kpi-lbl">📉 Суммарное снижение</span>
        <span class="kpi-val" style="color:#DC2626">${totalNegDelta}%</span>
      </div>
      <div class="stage-dyn-kpi-item" style="border-left:3px solid var(--acc)">
        <span class="kpi-lbl">⚡ Чистая динамика (Δ)</span>
        <span class="kpi-val" style="color:${netDelta >= 0 ? 'var(--acc)' : '#DC2626'}">${netDelta >= 0 ? '+' + netDelta : netDelta}%</span>
      </div>
      <div class="stage-dyn-kpi-item" style="border-left:3px solid #6366F1">
        <span class="kpi-lbl">🔄 Операций изменения</span>
        <span class="kpi-val" style="color:#4F46E5">${totalOps}</span>
      </div>
    </div>
  `;

  // Sidebar stage chips
  const stageChipsHtml = `
    <div class="stage-dyn-sidebar">
      <div style="font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:4px;display:flex;justify-content:space-between">
        <span>Этапы</span>
        <span>Δ %</span>
      </div>
      <div class="stage-dyn-chip ${stageDynFilter.stageId === null ? 'on' : ''}" data-stage-filter="all">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--ink)"></span>
          <span>Все этапы</span>
        </div>
        <span class="mono" style="font-weight:700;color:var(--acc)">${netDelta >= 0 ? '+' + netDelta : netDelta}%</span>
      </div>
      ${stages.map(st => {
        const sData = stageStats[st.id] || { net: 0, count: 0 };
        const isOn = stageDynFilter.stageId === st.id;
        const netStr = sData.net > 0 ? `+${sData.net}%` : (sData.net < 0 ? `${sData.net}%` : '0%');
        const stColor = st.color || '#3B82F6';
        return `
          <div class="stage-dyn-chip ${isOn ? 'on' : ''}" data-stage-filter="${st.id}">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="width:8px;height:8px;border-radius:50%;background:${stColor};flex:none"></span>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px" title="${esc(st.name)}">${esc(st.name)}</span>
            </div>
            <span class="mono" style="font-size:11px;font-weight:700;color:${sData.net >= 0 ? '#059669' : '#DC2626'}">${netStr}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // SVG Chart rendering
  let chartSvgHtml = '';
  if (!buckets.length) {
    chartSvgHtml = `<div style="color:var(--mut2);text-align:center;padding:48px 24px;font-size:13px">
      📊 Нет данных о динамике изменения этапов за выбранный период.<br>
      <span style="font-size:12px;color:var(--mut)">Измените прогресс этапов в карточке проекта, чтобы здесь отобразился график динамики.</span>
    </div>`;
  } else {
    const W = Math.max(680, buckets.length * 64 + 90);
    const H = 250;
    const padL = 54;
    const padR = 24;
    const padT = 30;
    const padB = 45;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    let maxVal = 20;
    let minVal = 0;
    buckets.forEach(b => {
      if (b.posDelta > maxVal) maxVal = b.posDelta;
      if (b.negDelta < minVal) minVal = b.negDelta;
    });

    const hasNeg = minVal < 0;
    const range = maxVal - minVal;
    // Y position function
    const getY = (val) => padT + ((maxVal - val) / range) * chartH;
    const y0 = getY(0);

    const colW = chartW / buckets.length;
    const barW = Math.min(42, Math.max(16, colW * 0.62));

    // Y Axis Grid lines (e.g. max, 0, min)
    let gridLines = '';
    const yTicks = [maxVal, Math.round(maxVal / 2), 0];
    if (hasNeg) {
      yTicks.push(Math.round(minVal / 2));
      yTicks.push(minVal);
    }
    const uniqueTicks = Array.from(new Set(yTicks));

    gridLines = uniqueTicks.map(tv => {
      const y = getY(tv);
      const isZero = tv === 0;
      return `
        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${isZero ? 'var(--ink)' : 'var(--line2)'}" stroke-width="${isZero ? '1.5' : '1'}" stroke-dasharray="${isZero ? 'none' : '3,3'}"></line>
        <text x="${padL - 8}" y="${y + 4}" font-family="'JetBrains Mono', monospace" font-size="10.5" fill="${isZero ? 'var(--ink)' : 'var(--mut)'}" font-weight="${isZero ? '700' : '500'}" text-anchor="end">${tv > 0 ? '+' + tv : tv}%</text>
      `;
    }).join('');

    // Bars & labels for each bucket
    const barsHtml = buckets.map((b, idx) => {
      const cx = padL + idx * colW + colW / 2;
      const x = cx - barW / 2;

      let posSegmentsHtml = '';
      let curY = y0;
      // Multi-stage stacked positive bars
      Object.entries(b.stages).forEach(([stId, sData]) => {
        if (sData.pos > 0) {
          const segH = (sData.pos / range) * chartH;
          const segY = curY - segH;
          const stObj = stages.find(s => s.id === +stId);
          const col = stObj?.color || '#10B981';
          posSegmentsHtml += `
            <rect x="${x}" y="${segY}" width="${barW}" height="${segH}" fill="${col}" rx="3" opacity="0.9" stroke="rgba(0,0,0,0.1)" stroke-width="0.5">
              <title>${esc(stObj?.name || 'Этап')}: +${sData.pos}% (${b.label})</title>
            </rect>
          `;
          curY = segY;
        }
      });

      let negSegmentsHtml = '';
      let curNegY = y0;
      // Multi-stage stacked negative bars
      Object.entries(b.stages).forEach(([stId, sData]) => {
        if (sData.neg < 0) {
          const segH = (Math.abs(sData.neg) / range) * chartH;
          const segY = curNegY;
          const stObj = stages.find(s => s.id === +stId);
          const col = stObj?.color || '#EF4444';
          negSegmentsHtml += `
            <rect x="${x}" y="${segY}" width="${barW}" height="${segH}" fill="${col}" rx="3" opacity="0.85" stroke="#DC2626" stroke-width="0.5">
              <title>${esc(stObj?.name || 'Этап')}: ${sData.neg}% (${b.label})</title>
            </rect>
          `;
          curNegY += segH;
        }
      });

      const posLabel = b.posDelta > 0 ? `<text x="${cx}" y="${curY - 6}" font-family="'JetBrains Mono', monospace" font-size="10.5" font-weight="700" fill="#059669" text-anchor="middle">+${b.posDelta}%</text>` : '';
      const negLabel = b.negDelta < 0 ? `<text x="${cx}" y="${curNegY + 13}" font-family="'JetBrains Mono', monospace" font-size="10.5" font-weight="700" fill="#DC2626" text-anchor="middle">${b.negDelta}%</text>` : '';

      return `
        <g class="stage-dyn-bucket-col">
          <rect class="stage-dyn-col-hover" x="${padL + idx * colW}" y="${padT}" width="${colW}" height="${chartH}" rx="4">
            <title>${esc(b.label)}\nПрирост: +${b.posDelta}%\nСнижение: ${b.negDelta}%\nЧистая дельта: ${b.netDelta >= 0 ? '+' + b.netDelta : b.netDelta}%\nОпераций: ${b.opsCount}</title>
          </rect>
          ${posSegmentsHtml}
          ${negSegmentsHtml}
          ${posLabel}
          ${negLabel}
          <text x="${cx}" y="${H - 12}" font-family="'JetBrains Mono', monospace" font-size="10.5" fill="var(--ink)" font-weight="600" text-anchor="middle">${esc(b.label)}</text>
        </g>
      `;
    }).join('');

    chartSvgHtml = `
      <div class="stage-dyn-chart-box">
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" style="min-width:${Math.min(W, 720)}px;overflow:visible">
          ${gridLines}
          ${barsHtml}
        </svg>
      </div>
    `;
  }

  // Recent changes log table underneath
  const recentHist = hist.slice(-20).reverse();
  const logRows = recentHist.map(h => {
    const pj = (S.projects || []).find(p => p.id === h.projectId);
    const stgObj = (S.stages || []).find(s => s.id === h.stageId);
    const delta = h.to - h.from;
    const deltaBadge = delta >= 0
      ? `<span class="chip" style="background:#E6FFFA;color:#234E52;font-weight:700">+${delta}%</span>`
      : `<span class="chip" style="background:#FED7D7;color:#9B2C2C;font-weight:700">${delta}%</span>`;

    return `
      <tr class="rw" data-view-id="${h.projectId}" style="cursor:pointer">
        <td class="mono" style="font-size:11.5px;color:var(--mut);width:130px">${fmtDT(h.ts)}</td>
        <td><b>${pj ? esc(pj.name) : '—'}</b> <span class="mono" style="color:var(--mut);font-size:11px">(${pj?.num || ''})</span></td>
        <td>${stgObj ? chipHtml(stgObj.name, colorOf(stgObj)) : '—'}</td>
        <td class="mono" style="font-size:12px;font-weight:600">${h.from}% → <b>${h.to}%</b></td>
        <td style="text-align:right">${deltaBadge}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="stage-dyn-card">
      <div class="stage-dyn-toolbar">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-family:'Unbounded',sans-serif;font-size:13px;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:6px">
            📊 Динамика этапов
          </span>
          ${periodBtns}
        </div>
        ${projSelect}
      </div>

      ${kpisHtml}

      <div class="stage-dyn-layout">
        ${stageChipsHtml}
        <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
          ${chartSvgHtml}
        </div>
      </div>

      ${recentHist.length ? `
      <div style="border-top:1px solid var(--line2);padding-top:10px">
        <div style="font-size:12px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
          <span>Журнал операций изменения этапов (последние ${recentHist.length})</span>
          <span style="font-size:11px;font-weight:normal;color:var(--mut)">Кликните строку для просмотра проекта</span>
        </div>
        <div style="overflow-x:auto;max-height:220px">
          <table class="mini-t" style="width:100%">
            <thead>
              <tr style="background:#F8F9F4">
                <th>Дата и время</th>
                <th>Проект</th>
                <th>Этап</th>
                <th>Изменение</th>
                <th style="text-align:right">Дельта</th>
              </tr>
            </thead>
            <tbody>${logRows}</tbody>
          </table>
        </div>
      </div>` : ''}
    </div>
  `;
}

// CSV Exporter
function exportReportToCsv(S, ent, items) {
  if (!items.length) {
    toast('Нет данных для экспорта', 'err');
    return;
  }

  const headers = ['Код', 'Название', 'Заказчик', 'Статус', 'Приоритет', 'Разработчик', 'Агент', 'Дата начала', 'Дата окончания'];
  const rows = items.map(r => {
    const st = statFor(S, ent, r.statusId)?.name || '';
    const pr = pri(S, r.priorityId)?.name || '';
    const dv = emp(S, r.devId)?.name || '';
    const ag = emp(S, r.agentId)?.name || '';
    const cs = (S.customers || []).find(c => c.id === r.customerId)?.name || '';

    return [
      `"${(r.num || '').replace(/"/g, '""')}"`,
      `"${(r.name || '').replace(/"/g, '""')}"`,
      `"${cs.replace(/"/g, '""')}"`,
      `"${st.replace(/"/g, '""')}"`,
      `"${pr.replace(/"/g, '""')}"`,
      `"${dv.replace(/"/g, '""')}"`,
      `"${ag.replace(/"/g, '""')}"`,
      `"${r.start || ''}"`,
      `"${r.end || ''}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Report_${ent}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  toast('Отчёт выгружен в CSV', 'ok');
}

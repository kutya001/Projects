// src/ui/viewFilters.js
import { esc } from '../utils/dom.js';
import { colorOf } from '../utils/color.js';
import { popover, closePop } from './popover.js';
import { savePrefs } from '../core/prefs.js';

export function getViewFilters(S, ent, viewType) {
  S.prefs.viewFilters = S.prefs.viewFilters || {};
  const key = `${viewType}_${ent}`;
  S.prefs.viewFilters[key] = S.prefs.viewFilters[key] || {
    statuses: [],
    stages: [],
    devs: [],
    agents: [],
    customers: []
  };
  return S.prefs.viewFilters[key];
}

export function matchViewFilters(S, ent, r, f) {
  if (!f) return true;
  if (f.statuses && f.statuses.length && !f.statuses.includes(r.statusId)) return false;
  if (ent === 'projects' && f.stages && f.stages.length && !f.stages.includes(r.stageId)) return false;
  
  if (f.devs && f.devs.length) {
    const devMatch = f.devs.includes(r.devId) || (Array.isArray(r.devs) && r.devs.some(id => f.devs.includes(id)));
    if (!devMatch) return false;
  }

  if (f.agents && f.agents.length) {
    const agentMatch = f.agents.includes(r.agentId) || (Array.isArray(r.agents) && r.agents.some(id => f.agents.includes(id)));
    if (!agentMatch) return false;
  }

  if (f.customers && f.customers.length && !f.customers.includes(r.customerId)) return false;
  return true;
}

export function countActiveViewFilters(f, searchQuery) {
  if (!f) return searchQuery ? 1 : 0;
  const count = (f.statuses?.length ? 1 : 0) +
    (f.stages?.length ? 1 : 0) +
    (f.devs?.length ? 1 : 0) +
    (f.agents?.length ? 1 : 0) +
    (f.customers?.length ? 1 : 0) +
    (searchQuery ? 1 : 0);
  return count;
}

export async function resetViewFilters(S, ent, viewType) {
  S.prefs.viewFilters = S.prefs.viewFilters || {};
  const key = `${viewType}_${ent}`;
  S.prefs.viewFilters[key] = {
    statuses: [],
    stages: [],
    devs: [],
    agents: [],
    customers: []
  };
  S.search = '';
  const topSearch = document.querySelector('#topSearch');
  if (topSearch) topSearch.value = '';
  await savePrefs(S);
}

export function openViewFiltersPopover(anchorEl, S, ent, viewType, onApply) {
  const f = getViewFilters(S, ent, viewType);
  const rows = S[ent] || [];

  // 1. Statuses (only existing in rows, sorted alphabetically)
  const statusDict = ent === 'projects' ? (S.projectStatuses || []) : (S.taskStatuses || []);
  const usedStatusIds = new Set(rows.map(r => r.statusId).filter(id => id != null));
  const availableStatuses = statusDict
    .filter(s => usedStatusIds.has(s.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true }));

  // 2. Stages (projects only)
  const usedStageIds = new Set(rows.map(r => r.stageId).filter(id => id != null));
  const availableStages = (S.stages || [])
    .filter(s => usedStageIds.has(s.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true }));

  // 3. Devs (only active and present)
  const usedDevIds = new Set();
  rows.forEach(r => {
    if (r.devId != null) usedDevIds.add(r.devId);
    if (Array.isArray(r.devs)) r.devs.forEach(d => { if (d != null) usedDevIds.add(d); });
  });
  const availableDevs = (S.employees || [])
    .filter(e => e.role === 'dev' && e.active !== false && e.active !== 0 && usedDevIds.has(e.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true }));

  // 4. Agents (only active and present)
  const usedAgentIds = new Set();
  rows.forEach(r => {
    if (r.agentId != null) usedAgentIds.add(r.agentId);
    if (Array.isArray(r.agents)) r.agents.forEach(a => { if (a != null) usedAgentIds.add(a); });
  });
  const availableAgents = (S.employees || [])
    .filter(e => e.role === 'agent' && e.active !== false && e.active !== 0 && usedAgentIds.has(e.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true }));

  // 5. Customers
  const usedCustIds = new Set(rows.map(r => r.customerId).filter(id => id != null));
  const availableCustomers = (S.customers || [])
    .filter(c => usedCustIds.has(c.id))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru', { numeric: true }));

  const filterSection = (title, key, items, selectedIds) => {
    if (!items.length) return '';
    return `
      <div style="margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--mut);letter-spacing:0.05em;margin-bottom:4px">
          ${title} (${items.length})
        </div>
        <div style="max-height:130px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;border:1px solid var(--line2);border-radius:6px;padding:4px 6px;background:#FAFAF7">
          ${items.map(it => {
            const isChecked = selectedIds.includes(it.id);
            const colorDot = it.color ? `<span class="dot" style="background:${colorOf(it)};width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px"></span>` : '';
            return `
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;padding:2px 0">
                <input type="checkbox" data-grp="${key}" value="${it.id}" ${isChecked ? 'checked' : ''}>
                <span style="display:inline-flex;align-items:center">${colorDot}${esc(it.name)}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;
  };

  const popHtml = `
    <div class="pt" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <span>Фильтры карточек</span>
    </div>
    <div style="max-height:360px;overflow-y:auto;min-width:240px;max-width:290px;padding-right:4px">
      ${filterSection('Статус', 'statuses', availableStatuses, f.statuses || [])}
      ${ent === 'projects' ? filterSection('Этап', 'stages', availableStages, f.stages || []) : ''}
      ${filterSection('Разработчик', 'devs', availableDevs, f.devs || [])}
      ${filterSection('Агент', 'agents', availableAgents, f.agents || [])}
      ${filterSection('Заказчик', 'customers', availableCustomers, f.customers || [])}
    </div>
    <div class="pact" style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;border-top:1px solid var(--line2);padding-top:8px">
      <button class="btn sm" id="btnPopResetFilters">Сбросить</button>
      <button class="btn sm pri" id="btnPopApplyFilters" style="font-weight:700">Применить</button>
    </div>
  `;

  popover(anchorEl, popHtml, async popEl => {
    popEl.querySelector('#btnPopResetFilters').onclick = async () => {
      f.statuses = [];
      f.stages = [];
      f.devs = [];
      f.agents = [];
      f.customers = [];
      await savePrefs(S);
      closePop();
      if (onApply) onApply();
    };

    popEl.querySelector('#btnPopApplyFilters').onclick = async () => {
      const getChecked = grp => [...popEl.querySelectorAll(`input[data-grp="${grp}"]:checked`)].map(i => +i.value);
      f.statuses = getChecked('statuses');
      f.stages = getChecked('stages');
      f.devs = getChecked('devs');
      f.agents = getChecked('agents');
      f.customers = getChecked('customers');
      await savePrefs(S);
      closePop();
      if (onApply) onApply();
    };
  });
}

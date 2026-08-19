// src/components/table/renderers.js
import { esc } from '../../utils/dom.js';
import { fmtD, fmtDT } from '../../utils/date.js';
import { tint, txtOn, shade, colorOf } from '../../utils/color.js';
import { emp, prj, tsk } from '../../services/refs.js';

const LOG_ACTION_MAP = {
  connect: { label: 'Вход', bg: '#E6FFFA', border: '#B2F5EA', col: '#234E52' },
  disconnect: { label: 'Выход', bg: '#EDF2F7', border: '#E2E8F0', col: '#4A5568' },
  create: { label: 'Создание', bg: '#F0FFF4', border: '#C6F6D5', col: '#22543D' },
  update: { label: 'Изменение', bg: '#EBF8FF', border: '#BEE3F8', col: '#2A4365' },
  delete: { label: 'Удаление', bg: '#FFF5F5', border: '#FED7D7', col: '#742A2A' },
  bulk_insert: { label: 'Вставка', bg: '#FAF5FF', border: '#E9D8FD', col: '#44337A' },
  clear_table: { label: 'Очистка', bg: '#FFF5F5', border: '#FEB2B2', col: '#9B2C2C' }
};

const LOG_ENT_MAP = {
  system: 'Система',
  projects: 'Проекты',
  tasks: 'Задачи',
  changes: 'Изменения',
  employees: 'Сотрудники',
  customers: 'Заказчики',
  priorities: 'Приоритеты',
  stages: 'Этапы',
  taskStatuses: 'Статусы задач',
  projectStatuses: 'Статусы проектов',
  kanbanBoards: 'Канбан доски',
  formLayouts: 'Макеты форм'
};

export const FIELD_NAMES = {
  name: 'Название',
  num: 'Номер / Код',
  statusId: 'Статус',
  priorityId: 'Приоритет',
  stageId: 'Этап',
  customerId: 'Заказчик',
  devId: 'Разработчик',
  agentId: 'Агент',
  projectId: 'Проект',
  taskId: 'Задача',
  start: 'Дата начала',
  end: 'Дата окончания',
  desc: 'Описание',
  note: 'Примечание',
  stageProgress: 'Прогресс этапов',
  agents: 'Участники-агенты',
  devs: 'Участники-разработчики',
  extNum: 'Внешний №',
  extLink: 'Внешняя ссылка',
  role: 'Роль',
  position: 'Должность',
  contacts: 'Контакты',
  color: 'Цвет',
  weight: 'Вес',
  order: 'Порядок',
  active: 'Активность',
  columns: 'Колонки',
  wipLimits: 'WIP-лимиты',
  layout: 'Макет формы'
};

/**
 * Convert technical field values to human-readable names using state dictionaries
 */
export function formatLogValue(S, entity, fieldKey, val) {
  if (val === null || val === undefined || val === '') return '—';

  if (fieldKey === 'statusId') {
    const list = entity === 'projects' ? (S.projectStatuses || []) : (S.taskStatuses || []);
    const item = list.find(x => x.id === val);
    return item ? `«${item.name}»` : `ID ${val}`;
  }
  if (fieldKey === 'priorityId') {
    const item = (S.priorities || []).find(x => x.id === val);
    return item ? `«${item.name}»` : `ID ${val}`;
  }
  if (fieldKey === 'stageId') {
    const item = (S.stages || []).find(x => x.id === val);
    return item ? `«${item.name}»` : `ID ${val}`;
  }
  if (fieldKey === 'customerId') {
    const item = (S.customers || []).find(x => x.id === val);
    return item ? `«${item.name}»` : `ID ${val}`;
  }
  if (fieldKey === 'devId' || fieldKey === 'agentId') {
    const item = (S.employees || []).find(x => x.id === val);
    return item ? `«${item.name}»` : `ID ${val}`;
  }
  if (fieldKey === 'projectId') {
    const item = (S.projects || []).find(x => x.id === val);
    return item ? (item.num ? `${item.num} · ${item.name}` : `«${item.name}»`) : `ID ${val}`;
  }
  if (fieldKey === 'taskId') {
    const item = (S.tasks || []).find(x => x.id === val);
    return item ? (item.num ? `${item.num} · ${item.name}` : `«${item.name}»`) : `ID ${val}`;
  }
  if (fieldKey === 'agents' || fieldKey === 'devs') {
    if (Array.isArray(val)) {
      if (!val.length) return '— (пусто)';
      const names = val.map(id => {
        const item = (S.employees || []).find(x => x.id === id);
        return item ? item.name : `ID ${id}`;
      });
      return `[${names.join(', ')}]`;
    }
  }
  if (fieldKey === 'stageProgress') {
    if (typeof val === 'object' && val !== null) {
      const parts = Object.entries(val).map(([stId, prog]) => {
        const stage = (S.stages || []).find(s => s.id === +stId);
        return `${stage ? stage.name : `Этап ${stId}`}: ${prog}%`;
      });
      return parts.join(', ') || '—';
    }
  }
  if (fieldKey === 'start' || fieldKey === 'end') {
    return fmtD(val) || String(val);
  }
  if (fieldKey === 'active') {
    return val ? 'Активен' : 'Неактивен';
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return String(val);
}

export function colVal(S, ent, r, k) {
  switch (k) {
    case 'tasksCount': return S.tasks.filter(t => t.projectId === r.id).length;
    case 'changesCount': return S.changes.filter(c => c.taskId === r.id).length;
    case 'progress': {
      if (!S.stages || !S.stages.length) return 0;
      const sum = S.stages.reduce((acc, st) => acc + (r.stageProgress ? (r.stageProgress[st.id] || 0) : 0), 0);
      return Math.round(sum / S.stages.length);
    }
    case 'lastNote':
    case 'note': {
      if (r.notes && r.notes.length) {
        const sorted = [...r.notes].sort((a, b) => {
          const tA = a.createdAt || a.updatedAt || '';
          const tB = b.createdAt || b.updatedAt || '';
          return tA < tB ? 1 : (tA > tB ? -1 : 0);
        });
        return sorted[0]?.text || '';
      }
      return r.note || '';
    }
    case 'checklistsProgress': {
      const chks = r.checklists || [];
      if (!chks.length) return '';
      const done = chks.filter(c => c.done).length;
      return `${done}/${chks.length}`;
    }
    case 'agents': return (r.agents || []).map(id => (emp(S, id) || {}).name || '').filter(Boolean).join(', ');
    case 'devs': return (r.devs || []).map(id => (emp(S, id) || {}).name || '').filter(Boolean).join(', ');
    case 'projectId': return prj(S, r.projectId)?.name || null;
    case 'taskId': return tsk(S, r.taskId)?.name || null;
    case 'action': return LOG_ACTION_MAP[r.action]?.label || r.action;
    case 'entity': return LOG_ENT_MAP[r.entity] || r.entity;
    case 'field': return r.field ? r.field.split(', ').map(f => FIELD_NAMES[f] || f).join(', ') : '—';
    default: return r[k];
  }
}

export function dirItem(colDef, id) {
  return (colDef.dir ? colDef.dir() : []).find(x => x.id === id);
}

export function chipHtml(name, color) {
  return `<span class="chip" title="${esc(name)}" style="background:${tint(color, .13)};border-color:${tint(color, .45)};color:${txtOn('#f8f8f8') === '#1B2430' ? shade(color) : '#333'}"><i style="background:${color}"></i><span class="chip-txt">${esc(name)}</span></span>`;
}

export function stageMiniBarsHtml(S, r) {
  const stages = S.stages || [];
  if (!stages.length) return '<span style="color:var(--mut2)">—</span>';

  const rows = stages.map(st => {
    const val = r.stageProgress ? (r.stageProgress[st.id] || 0) : 0;
    const initial = (st.name || '').trim().charAt(0).toUpperCase() || '•';
    const barColor = st.color || '#3B82F6';

    return `<div class="stage-mini-row" title="${esc(st.name)}: ${val}%" style="display:flex;align-items:center;gap:6px;margin:2px 0;font-size:11px">
      <span class="mono" style="font-weight:700;color:var(--ink);width:14px;text-align:center">${esc(initial)}</span>
      <div style="flex:1;min-width:45px;max-width:70px;background:rgba(0,0,0,0.06);height:9px;border-radius:2px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.1)">
        <div style="width:${val}%;height:100%;background:${barColor};border-radius:2px;box-shadow:1px 1px 3px rgba(0,0,0,0.25)"></div>
      </div>
      <span class="mono" style="font-size:10.5px;color:var(--mut);width:30px;text-align:right">${val}%</span>
    </div>`;
  }).join('');

  return `<div class="stage-mini-chart" style="display:flex;flex-direction:column;padding:2px 0">${rows}</div>`;
}

export function cellHtml(S, ent, cdef, r) {
  const k = cdef.k;
  if (k === 'stagesChart' || cdef.type === 'stagesChart') {
    return stageMiniBarsHtml(S, r);
  }
  if (cdef.type === 'select') {
    let it = dirItem(cdef, r[k]);
    if (!it && (k === 'devId' || k === 'agentId')) {
      it = emp(S, r[k]);
    }
    return it ? chipHtml(it.name + ((it.active === false || it.active === 0) ? ' (неактивен)' : ''), colorOf(it)) : `<span style="color:var(--mut2)">—</span>`;
  }
  if (cdef.type === 'multi') {
    const ids = r[k === 'agents' ? 'agents' : 'devs'] || [];
    if (!ids.length) return `<span style="color:var(--mut2)">—</span>`;
    return ids.slice(0, 3).map(id => {
      const e = emp(S, id);
      return e ? `<span class="chip" style="margin:1px 2px 1px 0;background:${tint(colorOf(e), .13)};border-color:${tint(colorOf(e), .4)}"><i style="background:${colorOf(e)}"></i>${esc(e.name)}</span>` : '';
    }).join('') + (ids.length > 3 ? `<span class="mono" style="color:var(--mut)">+${ids.length - 3}</span>` : '');
  }
  if (cdef.type === 'datetime') {
    return r[k] ? `<span class="mono" style="font-size:11.5px">${fmtDT(r[k])}</span>` : `<span style="color:var(--mut2)">—</span>`;
  }
  if (cdef.type === 'date') {
    return r[k] ? `<span class="mono">${fmtD(r[k])}</span>` : `<span style="color:var(--mut2)">—</span>`;
  }
  if (cdef.type === 'number') return `<span class="mono">${colVal(S, ent, r, k)}</span>`;
  if (cdef.type === 'color') {
    const col = r[k] || '#0B7285';
    return `<div style="display:flex;align-items:center;gap:6px"><span class="sw" style="background:${col};width:16px;height:16px;border-radius:4px;border:1px solid var(--line);display:inline-block"></span><span class="mono" style="font-size:11.5px;color:var(--mut)">${esc(col)}</span></div>`;
  }
  if (cdef.type === 'role') {
    return r.role === 'dev'
      ? `<span class="chip" style="background:#EBF5FF;border-color:#BEE3F8;color:#2B6CB0">Разработчик</span>`
      : `<span class="chip" style="background:#FEEBC8;border-color:#FBD38D;color:#C05621">Агент</span>`;
  }
  if (cdef.type === 'active') {
    return r.active !== false
      ? `<span style="color:var(--grn);font-weight:600;font-size:12px">● Активен</span>`
      : `<span style="color:var(--mut2);font-weight:600;font-size:12px">○ Неактивен</span>`;
  }
  if (cdef.type === 'stageDelta') {
    const delta = (r.to || 0) - (r.from || 0);
    if (delta > 0) return `<span class="chip" style="background:#E6FFFA;color:#234E52;font-weight:700">+${delta}%</span>`;
    if (delta < 0) return `<span class="chip" style="background:#FED7D7;color:#9B2C2C;font-weight:700">${delta}%</span>`;
    return `<span class="chip" style="background:#EDF2F7;color:#4A5568">0%</span>`;
  }
  if (cdef.type === 'logAction') {
    const info = LOG_ACTION_MAP[r.action] || { label: r.action, bg: '#F7FAFC', border: '#E2E8F0', col: '#2D3748' };
    return `<span class="chip" style="background:${info.bg};border-color:${info.border};color:${info.col};font-weight:700">${esc(info.label)}</span>`;
  }
  if (ent === 'auditLogs' && k === 'target') {
    const rawTarget = r.target || '';
    if (!rawTarget || rawTarget === '—') return `<span style="color:var(--mut2)">—</span>`;
    return `<button class="btn link mono log-target-btn" data-log-ent="${esc(r.entity || '')}" data-log-target="${esc(rawTarget)}" data-log-id="${r.id}" title="Перейти к объекту «${esc(rawTarget)}»" style="font-size:12.5px;text-align:left;padding:0;color:var(--acc);font-weight:700;text-decoration:underline;cursor:pointer;background:none;border:none;display:inline-flex;align-items:center;gap:4px">
      ${esc(rawTarget)}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;opacity:0.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
    </button>`;
  }
  if (cdef.type === 'logEntity') {
    const ru = LOG_ENT_MAP[r.entity] || r.entity;
    return `<span class="chip" style="background:#F0F4F8;border-color:#D9E2EC;color:#334E68">${esc(ru)}</span>`;
  }
  if (cdef.type === 'logField') {
    if (!r.field || r.field === '—') return `<span style="color:var(--mut2)">—</span>`;
    const fNames = r.field.split(', ').map(f => FIELD_NAMES[f] || f).join(', ');
    return `<span class="chip" style="background:#F7FAFC;border-color:#CBD5E0;color:#2D3748;font-weight:600" title="${esc(fNames)}">${esc(fNames)}</span>`;
  }
  if (cdef.type === 'logDetails') {
    const details = r.details;
    if (!details) return `<span style="color:var(--mut2)">—</span>`;
    if (details.changes && Object.keys(details.changes).length) {
      const items = Object.entries(details.changes).map(([k, diff]) => {
        const fn = FIELD_NAMES[k] || k;
        const oV = formatLogValue(S, r.entity, k, diff.from);
        const nV = formatLogValue(S, r.entity, k, diff.to);
        return `<b>${esc(fn)}:</b> <span style="text-decoration:line-through;color:var(--mut);background:rgba(0,0,0,0.04);padding:0 3px;border-radius:2px">${esc(oV)}</span> → <span style="color:var(--acc);font-weight:700;background:rgba(11,114,133,0.08);padding:0 3px;border-radius:2px">${esc(nV)}</span>`;
      });
      return `<div style="font-size:12px;line-height:1.4;max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${items.join('\n').replace(/<[^>]*>/g, '')}">${items.join(', ')}</div>`;
    }
    if (details.activeClients != null) {
      return `<span style="font-size:12px;color:var(--mut)">Активных сессий: <b>${details.activeClients}</b></span>`;
    }
    if (details.created) {
      return `<span style="font-size:12px;color:var(--grn);font-weight:600">Создана запись «${esc(r.target)}»</span>`;
    }
    if (details.deleted) {
      return `<span style="font-size:12px;color:var(--red);font-weight:600">Удалена запись «${esc(r.target)}»</span>`;
    }
    const rawStr = JSON.stringify(details);
    return `<span style="font-size:11px;color:var(--mut);max-width:280px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(rawStr)}">${esc(rawStr)}</span>`;
  }
  if (k === 'lastNote' || k === 'note') {
    const noteText = colVal(S, ent, r, 'lastNote');
    if (!noteText) return `<span style="color:var(--mut2)">—</span>`;
    let lastNoteObj = null;
    if (r.notes && r.notes.length) {
      const sorted = [...r.notes].sort((a, b) => {
        const tA = a.createdAt || a.updatedAt || '';
        const tB = b.createdAt || b.updatedAt || '';
        return tA < tB ? 1 : (tA > tB ? -1 : 0);
      });
      lastNoteObj = sorted[0];
    }
    const metaStr = lastNoteObj ? `${fmtDT(lastNoteObj.createdAt)}${lastNoteObj.author ? ' · ' + lastNoteObj.author : ''}` : '';
    return `<div class="textcell" style="font-size:12px;color:var(--ink)" title="${esc(noteText)}${metaStr ? '\n(' + esc(metaStr) + ')' : ''}">${esc(noteText)}</div>`;
  }
  if (cdef.type === 'checklist' || k === 'checklistsProgress') {
    const chks = r.checklists || [];
    if (!chks.length) return `<span style="color:var(--mut2)">—</span>`;
    const done = chks.filter(c => c.done).length;
    const pct = Math.round((done / chks.length) * 100);
    return `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px" title="${done} из ${chks.length} выполнено (${pct}%)"><div class="progbar" style="width:48px;height:6px"><i style="width:${pct}%;background:${pct === 100 ? '#2F9E63' : 'var(--acc)'}"></i></div><span class="mono" style="font-weight:700;font-size:11px">${done}/${chks.length}</span></div>`;
  }
  if (cdef.type === 'percent' || k === 'progress') {
    const v = typeof colVal(S, ent, r, k) === 'number' ? colVal(S, ent, r, k) : (parseFloat(String(colVal(S, ent, r, k))) || 0);
    return `<div class="progwrap" title="Итоговый прогресс: ${v}%"><div class="progbar"><i style="width:${v}%"></i></div><span class="mono" style="font-weight:700;color:var(--acc)">${v}%</span></div>`;
  }
  if (k === 'extLink') {
    return r.extLink ? `<a href="${esc(r.extLink)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="color:var(--acc);display:inline-flex;align-items:center;gap:3px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
      открыть
    </a>` : `<span style="color:var(--mut2)">—</span>`;
  }
  if (k === 'name') return `<div class="namecell" title="${esc(r.name)}">${esc(r.name)}</div>`;
  if (k === 'num') return `<span class="numcell">${esc(r.num)}</span>`;

  const v = colVal(S, ent, r, k);
  return v ? `<div class="textcell" style="color:${(k === 'desc' || k === 'note') ? 'var(--mut)' : 'inherit'};font-size:12.5px" title="${esc(v)}">${esc(v)}</div>` : `<span style="color:var(--mut2)">—</span>`;
}

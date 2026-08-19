// src/components/timeline/TimelineView.js
import { esc } from '../../utils/dom.js';
import { fmtD, todayISO, diffDays, addDays, MONTHS, toISO } from '../../utils/date.js';
import { colorOf, txtOn } from '../../utils/color.js';
import { cardFields, savePrefs } from '../../core/prefs.js';
import { statFor, pri, emp, stg, prj } from '../../services/refs.js';
import { matchSearch } from '../table/filters.js';
import { getColDefs } from '../table/colDefs.js';
import { openCardSettings } from '../kanban/KanbanView.js';
import { popover, closePop } from '../../ui/popover.js';
import { getViewFilters, matchViewFilters, countActiveViewFilters, resetViewFilters, openViewFiltersPopover } from '../../ui/viewFilters.js';
import { setupTimelineDragDrop } from './dragDrop.js';
import { showContextMenu } from '../../ui/contextMenu.js';
import { getCommonContextMenuItems } from '../../services/quickActions.js';
import { toast } from '../../ui/toast.js';

const PPD = { day: 44, month: 13, quarter: 4.5, year: 1.2 };
const MAXLANE = { day: 15, month: 10, quarter: 8, year: 5 };
const MODES = [['year', 'Годы'], ['quarter', 'Кварталы'], ['month', 'Месяцы'], ['day', 'Дни']];
const TL_ANCHOR = {};
const TL_SCROLL_POS = {};

function tlWindow(mode, anchor) {
  const a = new Date(anchor + 'T00:00:00');
  let ws, we;
  if (mode === 'day') {
    ws = new Date(a.getFullYear(), a.getMonth(), 1);
    we = new Date(a.getFullYear(), a.getMonth() + 1, 0);
  } else if (mode === 'month') {
    ws = new Date(a.getFullYear(), a.getMonth(), 1);
    we = new Date(a.getFullYear(), a.getMonth() + 3, 0);
  } else if (mode === 'quarter') {
    const q = Math.floor(a.getMonth() / 3);
    ws = new Date(a.getFullYear(), q * 3, 1);
    we = new Date(a.getFullYear(), q * 3 + 12, 0);
  } else {
    ws = new Date(a.getFullYear() - 1, 0, 1);
    we = new Date(a.getFullYear() + 3, 11, 31);
  }
  return { ws, we, days: Math.round((we - ws) / 864e5) + 1 };
}

function calcFullTimelineWindow(S, ent, mode, anchor, coldefs) {
  const base = tlWindow(mode, anchor);
  const items = S[ent].filter(r => matchSearch(S, coldefs, ent, r));

  const today = todayISO();
  let minStart = today;
  let maxEnd = today;

  items.forEach(r => {
    const s = r.start || r.createdAt?.slice(0, 10);
    const e = r.end || r.targetDate || s;
    if (s && s < minStart) minStart = s;
    if (e && e > maxEnd) maxEnd = e;
  });

  let ws = new Date(base.ws);
  let we = new Date(base.we);

  if (minStart) {
    const dStart = new Date(minStart + 'T00:00:00');
    dStart.setDate(dStart.getDate() - 7);
    if (dStart < ws) ws = dStart;
  }

  if (maxEnd) {
    const dEnd = new Date(maxEnd + 'T00:00:00');
    dEnd.setDate(dEnd.getDate() + 14);
    if (dEnd > we) we = dEnd;
  }

  if (mode === 'day' || mode === 'month') {
    ws = new Date(ws.getFullYear(), ws.getMonth(), 1);
    we = new Date(we.getFullYear(), we.getMonth() + 1, 0);
  } else if (mode === 'quarter') {
    const q = Math.floor(ws.getMonth() / 3);
    ws = new Date(ws.getFullYear(), q * 3, 1);
    const eq = Math.floor(we.getMonth() / 3);
    we = new Date(we.getFullYear(), (eq + 1) * 3, 0);
  } else {
    ws = new Date(ws.getFullYear(), 0, 1);
    we = new Date(we.getFullYear(), 11, 31);
  }

  const days = Math.round((we - ws) / 864e5) + 1;
  return { ws, we, days };
}

function tlGroupDefs(S, ent, by) {
  const unb = { id: null, name: 'Не назначено', color: '#98A2B3' };
  if (by === 'dev') return [...S.employees.filter(e => e.role === 'dev' && e.active !== false && e.active !== 0), unb];
  if (by === 'agent') return [...S.employees.filter(e => e.role === 'agent' && e.active !== false && e.active !== 0), unb];
  if (by === 'priority') return [...S.priorities, unb];
  if (by === 'stage') return [...S.stages, unb];
  return [...(ent === 'projects' ? S.projectStatuses : S.taskStatuses), unb];
}

function tlMatch(by, g) {
  return r => {
    if (by === 'dev') return (r.devId ?? null) === (g.id ?? null);
    if (by === 'agent') return (r.agentId ?? null) === (g.id ?? null);
    if (by === 'priority') return (r.priorityId ?? null) === (g.id ?? null);
    if (by === 'stage') return (r.stageId ?? null) === (g.id ?? null);
    return (r.statusId ?? null) === (g.id ?? null);
  };
}

function barColor(S, ent, r, by) {
  if (by === 'priority') return colorOf(pri(S, r.priorityId));
  if (by === 'dev') return colorOf(emp(S, r.devId));
  if (by === 'agent') return colorOf(emp(S, r.agentId));
  if (by === 'stage') return colorOf(stg(S, r.stageId));
  return colorOf(statFor(S, ent, r.statusId));
}

export function renderTimelineView(S, ent, mount, callbacks = {}) {
  const prevScrollEl = mount.querySelector('#tlScrollEl');
  const prevLeft = prevScrollEl ? prevScrollEl.scrollLeft : (TL_SCROLL_POS[ent]?.left ?? null);
  const prevTop = prevScrollEl ? prevScrollEl.scrollTop : (TL_SCROLL_POS[ent]?.top ?? 0);
  const prevWindowY = window.scrollY;

  const coldefs = getColDefs(S);
  const mode = S.prefs.tlMode[ent] || 'month';
  const groupBy = S.prefs.tlGroup[ent] || (ent === 'projects' ? 'status' : 'dev');
  const colorBy = S.prefs.tlColor[ent] || 'status';
  const today = todayISO();

  if (!TL_ANCHOR[ent]) TL_ANCHOR[ent] = today;
  const { ws, we, days } = calcFullTimelineWindow(S, ent, mode, TL_ANCHOR[ent], coldefs);
  const ppd = PPD[mode];
  const totalW = Math.round(days * ppd);
  const LEFTW = 230;

  let topSegs = [], botSegs = [];
  const pushSeg = (arr, label, d, cls) => arr.push({ label, d, cls });
  const d0 = new Date(ws);

  if (mode === 'day') {
    let cur = null, cnt = 0;
    for (let i = 0; i < days; i++) {
      const dd = new Date(d0); dd.setDate(dd.getDate() + i);
      const mk = dd.getFullYear() + '-' + MONTHS[dd.getMonth()];
      if (cur !== mk) { if (cur) pushSeg(topSegs, cur, cnt); cur = mk; cnt = 1; } else cnt++;
      const wd = dd.getDay();
      const cls = (wd === 0 || wd === 6 ? 'we ' : '') + (toISO(dd) === today ? 'tod' : '');
      pushSeg(botSegs, dd.getDate(), 1, cls);
    }
    pushSeg(topSegs, cur, cnt);
  } else if (mode === 'month') {
    let cy = null, cnt = 0;
    for (let i = 0; i < days; i++) {
      const dd = new Date(d0); dd.setDate(dd.getDate() + i);
      if (cy !== dd.getFullYear()) { if (cy !== null) pushSeg(topSegs, cy, cnt); cy = dd.getFullYear(); cnt = 1; } else cnt++;
    }
    pushSeg(topSegs, cy, cnt);
    let cm = null, cc = 0;
    for (let i = 0; i < days; i++) {
      const dd = new Date(d0); dd.setDate(dd.getDate() + i);
      const mk = MONTHS[dd.getMonth()] + ' ’' + String(dd.getFullYear()).slice(2);
      if (cm !== mk) { if (cm) pushSeg(botSegs, cm, cc); cm = mk; cc = 1; } else cc++;
    }
    pushSeg(botSegs, cm, cc);
  } else if (mode === 'quarter') {
    let cy = null, cnt = 0;
    for (let i = 0; i < days; i++) {
      const dd = new Date(d0); dd.setDate(dd.getDate() + i);
      if (cy !== dd.getFullYear()) { if (cy !== null) pushSeg(topSegs, cy, cnt); cy = dd.getFullYear(); cnt = 1; } else cnt++;
    }
    pushSeg(topSegs, cy, cnt);
    let cq = null, cc = 0;
    for (let i = 0; i < days; i++) {
      const dd = new Date(d0); dd.setDate(dd.getDate() + i);
      const q = Math.floor(dd.getMonth() / 3);
      const mk = 'Q' + (q + 1) + ' ’' + String(dd.getFullYear()).slice(2);
      if (cq !== mk) { if (cq) pushSeg(botSegs, cq, cc); cq = mk; cc = 1; } else cc++;
    }
    pushSeg(botSegs, cq, cc);
  } else {
    let cy = null, cnt = 0;
    for (let i = 0; i < days; i++) {
      const dd = new Date(d0); dd.setDate(dd.getDate() + i);
      if (cy !== dd.getFullYear()) { if (cy !== null) pushSeg(topSegs, cy, cnt); cy = dd.getFullYear(); cnt = 1; } else cnt++;
    }
    pushSeg(topSegs, cy, cnt);
    let cq = null, cc = 0;
    for (let i = 0; i < days; i++) {
      const dd = new Date(d0); dd.setDate(dd.getDate() + i);
      const mk = 'Q' + (Math.floor(dd.getMonth() / 3) + 1);
      if (cq !== mk) { if (cq) pushSeg(botSegs, cq, cc); cq = mk; cc = 1; } else cc++;
    }
    pushSeg(botSegs, cq, cc);
  }

  const segRow = (segs, bot) => `<div class="tl-hseg ${bot ? 'bot' : ''}">${segs.map(s => `<div class="${s.cls || ''}" style="width:${Math.round(s.d * ppd)}px;flex:none">${esc(String(s.label))}</div>`).join('')}</div>`;
  let gdefs = tlGroupDefs(S, ent, groupBy).map(g => ({ ...g, match: tlMatch(groupBy, g) }));

  // Apply vertical row reordering if saved
  S.prefs.tlRowOrder = S.prefs.tlRowOrder || {};
  const rowOrderKey = `${ent}_${groupBy}`;
  const savedRowOrder = S.prefs.tlRowOrder[rowOrderKey];
  if (Array.isArray(savedRowOrder) && savedRowOrder.length) {
    gdefs.sort((a, b) => {
      const ia = savedRowOrder.indexOf(String(a.id ?? '__null'));
      const ib = savedRowOrder.indexOf(String(b.id ?? '__null'));
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });
  }

  const cf = cardFields(S, ent, 'tl');
  const tlFilters = getViewFilters(S, ent, 'tl');
  let rowsHtml = '', rowMeta = [];
  const wsT = ws.getTime();

  gdefs.forEach((g, gi) => {
    const rawItems = S[ent].filter(r => g.match(r) && matchSearch(S, coldefs, ent, r) && matchViewFilters(S, ent, r, tlFilters));
    const gidStr = String(g.id ?? '__null');
    const itemOrderKey = `${ent}_${groupBy}_${gidStr}`;
    S.prefs.tlItemOrder = S.prefs.tlItemOrder || {};
    const savedItemOrder = S.prefs.tlItemOrder[itemOrderKey];

    let items = rawItems.map(it => {
      const start = it.start || it.createdAt?.slice(0, 10) || today;
      const end = it.end || it.targetDate || start;
      return { ...it, start, end };
    });

    if (Array.isArray(savedItemOrder) && savedItemOrder.length) {
      items.sort((a, b) => {
        const ia = savedItemOrder.indexOf(a.id);
        const ib = savedItemOrder.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return a.start < b.start ? -1 : 1;
      });
    } else {
      items.sort((a, b) => a.start < b.start ? -1 : 1);
    }

    const laneEnd = [];
    const placed = items.map(it => {
      const s = new Date(it.start + 'T00:00:00').getTime();
      let li = laneEnd.findIndex(e => s >= e);
      if (li < 0) { li = laneEnd.length; laneEnd.push(0); }
      laneEnd[li] = new Date(it.end + 'T00:00:00').getTime() + 864e5;
      return { it, lane: li };
    });

    const maxL = MAXLANE[mode];
    const visible = placed.filter(p => p.lane < maxL);
    const hidden = placed.filter(p => p.lane >= maxL);
    const maxLaneIdx = placed.length ? Math.max(...placed.map(p => p.lane)) : 0;
    const rowH = Math.max(1, Math.min(maxL, maxLaneIdx + 1)) * 26 + 8;

    const bars = visible.map(({ it, lane }) => {
      const sT = new Date(it.start + 'T00:00:00').getTime(), eT = new Date(it.end + 'T00:00:00').getTime();
      if (eT < wsT || sT > we.getTime()) return '';
      const x = Math.max(0, Math.round((sT - wsT) / 864e5 * ppd));
      const w = Math.max(8, Math.round(diffDays(it.start, it.end) * ppd) - 2);
      const c = barColor(S, ent, it, colorBy);
      const st = statFor(S, ent, it.statusId);
      const pr = pri(S, it.priorityId);
      const dv = emp(S, it.devId);
      const ag = emp(S, it.agentId);
      const pj = prj(S, it.projectId);
      const sg = stg(S, it.stageId);
      const own = (groupBy === 'dev' || groupBy === 'agent') ? emp(S, it[groupBy === 'dev' ? 'devId' : 'agentId']) : (dv || ag);

      let barParts = [];

      // 1. Number
      if (cf.list.includes('num') && it.num) {
        barParts.push(`<span class="bn">${esc(it.num)}</span>`);
      }

      // 2. Name
      if (cf.list.includes('name') && it.name) {
        barParts.push(`<span class="bar-name" style="font-weight:700">${esc(it.name)}</span>`);
      }

      // 3. Status
      if (cf.list.includes('status') && st) {
        barParts.push(`<span class="bar-badge" style="background:rgba(0,0,0,0.3)">${esc(st.name)}</span>`);
      }

      // 4. Priority
      if (cf.list.includes('priority') && pr) {
        barParts.push(`<span class="bar-badge" style="background:rgba(0,0,0,0.3)">${esc(pr.name)}</span>`);
      }

      // 5. Stage (for projects)
      if (cf.list.includes('stage') && sg && ent === 'projects') {
        barParts.push(`<span class="bar-badge" style="background:rgba(0,0,0,0.3)">${esc(sg.name)}</span>`);
      }

      // 6. Owner
      if (cf.list.includes('owner') && own) {
        barParts.push(`<span class="bar-badge" style="background:rgba(0,0,0,0.3)">👤 ${esc(own.name)}</span>`);
      }

      // 7. Project
      if (cf.list.includes('project') && pj && ent !== 'projects') {
        barParts.push(`<span class="bar-badge" style="background:rgba(0,0,0,0.3)">▤ ${esc(pj.name)}</span>`);
      }

      // 8. Progress
      if (cf.list.includes('progress') && ent === 'projects' && S.stages && S.stages.length) {
        const sum = S.stages.reduce((acc, s) => acc + (it.stageProgress ? (it.stageProgress[s.id] || 0) : 0), 0);
        const pVal = Math.round(sum / S.stages.length);
        barParts.push(`<span class="bar-badge prog">${pVal}%</span>`);
      }

      // 9. Last Note
      if (cf.list.includes('lastNote')) {
        let ln = '';
        if (it.notes && it.notes.length) {
          const sorted = [...it.notes].sort((a, b) => {
            const tA = a.createdAt || a.updatedAt || '';
            const tB = b.createdAt || b.updatedAt || '';
            return tA < tB ? 1 : (tA > tB ? -1 : 0);
          });
          ln = sorted[0]?.text || '';
        } else if (it.note) {
          ln = it.note;
        }
        if (ln) {
          barParts.push(`<span class="bar-badge" style="background:rgba(0,0,0,0.3)" title="${esc(ln)}">📝 ${esc(ln.length > 30 ? ln.slice(0, 30) + '…' : ln)}</span>`);
        }
      }

      // 10. Checklists
      if (cf.list.includes('checklists') && it.checklists && it.checklists.length) {
        const doneCount = it.checklists.filter(c => c.done).length;
        const totalCount = it.checklists.length;
        const pct = Math.round((doneCount / totalCount) * 100);
        barParts.push(`<span class="bar-badge prog" title="${doneCount}/${totalCount} выполнено">☑️ ${doneCount}/${totalCount} (${pct}%)</span>`);
      }

      // 11. Dates
      if (cf.list.includes('dates') && (it.start || it.createdAt)) {
        const sDate = it.start || it.createdAt?.slice(0, 10);
        const eDate = it.end || sDate;
        barParts.push(`<span class="bar-date">📅 ${fmtD(sDate)} → ${fmtD(eDate)}</span>`);
      }

      const label = barParts.join(' ') || esc(it.name);

      let tooltipLines = [`${it.num ? it.num + ' · ' : ''}${it.name}`, `${fmtD(it.start)} → ${fmtD(it.end)} (${diffDays(it.start, it.end)} дн.)`];
      if (st) tooltipLines.push(`Статус: ${st.name}`);
      if (pr) tooltipLines.push(`Приоритет: ${pr.name}`);
      if (sg) tooltipLines.push(`Этап: ${sg.name}`);
      if (own) tooltipLines.push(`Ответственный: ${own.name}`);
      if (pj && ent !== 'projects') tooltipLines.push(`Проект: ${pj.name}`);
      if (ent === 'projects' && S.stages && S.stages.length) {
        const sum = S.stages.reduce((acc, s) => acc + (it.stageProgress ? (it.stageProgress[s.id] || 0) : 0), 0);
        tooltipLines.push(`Прогресс этапов: ${Math.round(sum / S.stages.length)}%`);
      }
      let tooltipNote = '';
      if (it.notes && it.notes.length) {
        const sorted = [...it.notes].sort((a, b) => {
          const tA = a.createdAt || a.updatedAt || '';
          const tB = b.createdAt || b.updatedAt || '';
          return tA < tB ? 1 : (tA > tB ? -1 : 0);
        });
        tooltipNote = sorted[0]?.text || '';
      } else if (it.note) {
        tooltipNote = it.note;
      }
      if (tooltipNote) {
        tooltipLines.push(`Заметка: ${tooltipNote}`);
      }
      if (it.checklists && it.checklists.length) {
        const doneCount = it.checklists.filter(c => c.done).length;
        tooltipLines.push(`Чек-лист: ${doneCount}/${it.checklists.length} выполнено`);
      }
      const title = tooltipLines.join('\n');

      return `<div class="bar" data-id="${it.id}" data-s="${it.start}" data-e="${it.end}" title="${esc(title)}"
        style="left:${x}px;width:${w}px;top:${6 + lane * 26}px;background:linear-gradient(180deg,${c},${c}d9);color:${txtOn(c)}">
        <span class="hnd l" data-h="l"></span><span style="overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center;gap:5px">${label}</span><span class="hnd r" data-h="r"></span></div>`;
    }).join('');

    rowsHtml += `<div class="tl-row" data-gi="${gi}" data-gid="${gidStr}">
      <div class="tl-left" draggable="true" data-rowgi="${gi}" style="height:${rowH}px">
        <span class="tl-row-drag" title="Перетащите для изменения вертикального порядка строк">⋮⋮</span>
        <span class="dot" style="background:${colorOf(g)}"></span>
        <span style="flex:1;overflow:hidden">
          <span class="nm">${esc(g.name)}</span><br>
          <span class="ct">${items.length} зап.</span>
        </span>
        <div class="tl-row-nav">
          <button data-row-up="${gi}" title="Переместить вверх">▲</button>
          <button data-row-down="${gi}" title="Переместить вниз">▼</button>
        </div>
        ${hidden.length ? `<span class="more" data-gi="${gi}" title="Не поместились в видимую область">+${hidden.length}</span>` : ''}
      </div>
      <div class="tl-canvas" data-gi="${gi}" style="width:${totalW}px;height:${rowH}px">${bars || '<span class="emptyrow">нет записей в периоде</span>'}</div>
    </div>`;

    rowMeta.push({ g, hidden: hidden.map(h => h.it), top: 0, h: rowH });
  });

  const activeFiltersCount = countActiveViewFilters(tlFilters, S.search);
  const filterBtnHtml = `
    <button class="btn sm ${activeFiltersCount ? 'pri' : ''}" id="btnTlFilters" title="Фильтрация элементов" style="display:inline-flex;align-items:center;gap:4px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>
      Фильтры ${activeFiltersCount ? `(${activeFiltersCount})` : ''}
    </button>
  `;

  const resetBtnHtml = activeFiltersCount > 0 ? `
    <button class="btn sm" id="btnTlResetFilters" title="Сбросить все применённые фильтры и поиск" style="display:inline-flex;align-items:center;gap:6px;background:#FFF5F5;border-color:#FEB2B2;color:#C53030;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>
      Применено фильтров: ${activeFiltersCount}
      <span style="font-weight:800;margin-left:2px;font-size:12px">✕ Сбросить</span>
    </button>
  ` : '';

  const todayX = Math.round(diffDays(toISO(ws), today) * ppd);
  mount.innerHTML = `
    <div class="timeline-view-panel">
      <div class="panel toolbar" style="margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:none">
        <span style="font-size:12px;color:var(--mut);font-weight:700;letter-spacing:.06em;text-transform:uppercase">Масштаб:</span>
        <div class="seg" id="tlMode">
          ${MODES.map(m => `<button data-m="${m[0]}" class="${mode === m[0] ? 'on' : ''}">${m[1]}</button>`).join('')}
        </div>
        <div class="seg" id="tlGroup">
          <button data-g="status" class="${groupBy === 'status' ? 'on' : ''}">По статусам</button>
          ${ent === 'projects' ? `<button data-g="stage" class="${groupBy === 'stage' ? 'on' : ''}">По этапам</button>` : ''}
          <button data-g="dev" class="${groupBy === 'dev' ? 'on' : ''}">По разработчикам</button>
          <button data-g="agent" class="${groupBy === 'agent' ? 'on' : ''}">По агентам</button>
          <button data-g="priority" class="${groupBy === 'priority' ? 'on' : ''}">По приоритетам</button>
        </div>
        <select id="tlColor" style="width:auto;padding:7px 10px">
          <option value="status" ${colorBy === 'status' ? 'selected' : ''}>Цвет: Статус</option>
          <option value="priority" ${colorBy === 'priority' ? 'selected' : ''}>Цвет: Приоритет</option>
          <option value="dev" ${colorBy === 'dev' ? 'selected' : ''}>Цвет: Разработчик</option>
          <option value="agent" ${colorBy === 'agent' ? 'selected' : ''}>Цвет: Агент</option>
          ${ent === 'projects' ? `<option value="stage" ${colorBy === 'stage' ? 'selected' : ''}>Цвет: Этап</option>` : ''}
        </select>
        <button class="btn sm" data-nav="-1">◀</button>
        <button class="btn sm" data-today>Сегодня</button>
        <button class="btn sm" data-nav="1">▶</button>
        <button class="btn sm" data-cards>⚙ Карточки</button>
        ${filterBtnHtml}
        ${resetBtnHtml}
        <span class="hint">Перетаскивайте полосы по дате и между строками · за края — растянуть · клик — карточка</span>
      </div>
      <div class="tl-scroll" id="tlScrollEl">
        <div style="min-width:${LEFTW + totalW}px;position:relative">
          <div class="tl-headrow">
            <div class="tl-corner" style="width:${LEFTW}px;min-width:${LEFTW}px;flex:none">${groupBy === 'dev' ? 'Разработчик (гл.)' : groupBy === 'agent' ? 'Агент (гл.)' : groupBy === 'priority' ? 'Приоритет' : groupBy === 'stage' ? 'Этап' : 'Статус'}</div>
            <div class="tl-hc" style="width:${totalW}px;flex:none">${segRow(topSegs)}${segRow(botSegs, true)}</div>
          </div>
          <div id="tlBody" style="position:relative">${rowsHtml}
            ${todayX >= 0 && todayX <= totalW ? `<div class="tl-today" style="left:${LEFTW + todayX}px"></div>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  const reRender = () => renderTimelineView(S, ent, mount, callbacks);

  // Restore scroll position strictly from cache without auto-jump to today
  const scrollEl = mount.querySelector('#tlScrollEl');
  if (scrollEl) {
    if (prevLeft !== null) {
      scrollEl.scrollLeft = prevLeft;
      scrollEl.scrollTop = prevTop;
    }
    scrollEl.addEventListener('scroll', () => {
      TL_SCROLL_POS[ent] = { left: scrollEl.scrollLeft, top: scrollEl.scrollTop };
    }, { passive: true });
  }

  if (prevWindowY > 0 && window.scrollY !== prevWindowY) {
    window.scrollTo(window.scrollX, prevWindowY);
  }

  mount.querySelectorAll('#tlMode button').forEach(b => b.onclick = async () => {
    S.prefs.tlMode[ent] = b.dataset.m;
    TL_SCROLL_POS[ent] = null;
    await savePrefs(S);
    reRender();
  });

  mount.querySelectorAll('#tlGroup button').forEach(b => b.onclick = async () => {
    S.prefs.tlGroup[ent] = b.dataset.g;
    await savePrefs(S);
    reRender();
  });

  mount.querySelector('#tlColor').onchange = async e => {
    S.prefs.tlColor[ent] = e.target.value;
    await savePrefs(S);
    reRender();
  };

  const btnTlFilters = mount.querySelector('#btnTlFilters');
  if (btnTlFilters) {
    btnTlFilters.onclick = (e) => {
      e.stopPropagation();
      openViewFiltersPopover(btnTlFilters, S, ent, 'tl', reRender);
    };
  }

  const btnTlResetFilters = mount.querySelector('#btnTlResetFilters');
  if (btnTlResetFilters) {
    btnTlResetFilters.onclick = async () => {
      await resetViewFilters(S, ent, 'tl');
      reRender();
    };
  }

  mount.querySelector('[data-cards]').onclick = () => openCardSettings(S, 'tl', reRender);
  mount.querySelector('[data-today]').onclick = () => {
    TL_ANCHOR[ent] = today;
    if (scrollEl && todayX > 0 && todayX < totalW) {
      scrollEl.scrollLeft = Math.max(0, todayX - 200);
      TL_SCROLL_POS[ent] = { left: scrollEl.scrollLeft, top: scrollEl.scrollTop };
    }
    reRender();
  };

  mount.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => {
    const dir = +b.dataset.nav;
    const step = { day: 31, month: 92, quarter: 182, year: 365 }[mode] * dir;
    TL_ANCHOR[ent] = addDays(TL_ANCHOR[ent], step);
    reRender();
  });

  mount.querySelectorAll('.tl-hseg.bot div').forEach(seg => seg.onclick = () => {
    if (mode === 'year') S.prefs.tlMode[ent] = 'quarter';
    else if (mode === 'quarter') S.prefs.tlMode[ent] = 'month';
    else if (mode === 'month') S.prefs.tlMode[ent] = 'day';
    else return;
    TL_SCROLL_POS[ent] = null;
    savePrefs(S);
    reRender();
  });

  // Vertical row reordering logic (Up / Down buttons and Drag & Drop)
  const saveNewRowOrder = async (curGdefs) => {
    const newOrder = curGdefs.map(grp => String(grp.id ?? '__null'));
    S.prefs.tlRowOrder = S.prefs.tlRowOrder || {};
    S.prefs.tlRowOrder[rowOrderKey] = newOrder;
    await savePrefs(S);
    toast('Порядок строк обновлен', 'ok');
    reRender();
  };

  mount.querySelectorAll('[data-row-up]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const idx = +btn.dataset.rowUp;
      if (idx > 0) {
        const temp = gdefs[idx];
        gdefs[idx] = gdefs[idx - 1];
        gdefs[idx - 1] = temp;
        saveNewRowOrder(gdefs);
      }
    };
  });

  mount.querySelectorAll('[data-row-down]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const idx = +btn.dataset.rowDown;
      if (idx < gdefs.length - 1) {
        const temp = gdefs[idx];
        gdefs[idx] = gdefs[idx + 1];
        gdefs[idx + 1] = temp;
        saveNewRowOrder(gdefs);
      }
    };
  });

  mount.querySelectorAll('.tl-row').forEach(rowEl => {
    const leftHeader = rowEl.querySelector('.tl-left');
    if (leftHeader) {
      leftHeader.addEventListener('dragstart', e => {
        const gi = leftHeader.dataset.rowgi;
        e.dataTransfer.setData('text/tlrowgi', gi);
        leftHeader.classList.add('dragging-row');
      });
      leftHeader.addEventListener('dragend', () => {
        leftHeader.classList.remove('dragging-row');
      });
    }

    rowEl.addEventListener('dragover', e => {
      if (e.dataTransfer.types.includes('text/tlrowgi')) {
        e.preventDefault();
        rowEl.classList.add('over-row');
      }
    });

    rowEl.addEventListener('dragleave', () => {
      rowEl.classList.remove('over-row');
    });

    rowEl.addEventListener('drop', async e => {
      const fromRowGi = e.dataTransfer.getData('text/tlrowgi');
      if (fromRowGi) {
        e.preventDefault();
        rowEl.classList.remove('over-row');
        const fromIdx = +fromRowGi;
        const toIdx = +rowEl.dataset.gi;
        if (fromIdx !== toIdx && fromIdx >= 0 && toIdx >= 0) {
          const movedGroup = gdefs[fromIdx];
          gdefs.splice(fromIdx, 1);
          gdefs.splice(toIdx, 0, movedGroup);
          await saveNewRowOrder(gdefs);
        }
      }
    });
  });

  mount.querySelectorAll('.more').forEach(m => m.onclick = e => {
    e.stopPropagation();
    const gi = +m.dataset.gi;
    const rm = rowMeta[gi];
    popover(m, `<div class="pt">${esc(rm.g.name)}: еще ${rm.hidden.length} не поместилось</div>
      <div style="max-height:240px;overflow:auto;min-width:240px">
      ${rm.hidden.map(it => {
        const c = barColor(S, ent, it, colorBy);
        return `<div class="pi" data-id="${it.id}"><span class="dot" style="background:${c}"></span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(it.num)} · ${esc(it.name)}</span><span class="mono" style="color:var(--mut)">${fmtD(it.start)}</span></div>`;
      }).join('')}</div>
      <div class="pact"><button class="btn sm" data-zoom>🔍 Показать по дням</button></div>`,
      p => {
        p.querySelectorAll('.pi').forEach(pi => pi.onclick = () => {
          closePop();
          if (callbacks.onView) callbacks.onView(ent, +pi.dataset.id);
        });
        p.querySelector('[data-zoom]').onclick = async () => {
          S.prefs.tlMode[ent] = 'day';
          TL_ANCHOR[ent] = rm.hidden[0]?.start || today;
          await savePrefs(S);
          closePop();
          reRender();
        };
      });
  });

  setupTimelineDragDrop(S, ent, mount, reRender, rowMeta, groupBy, ppd, callbacks, wsT);

  mount.querySelectorAll('.bar').forEach(bar => {
    const id = +bar.dataset.id;
    const triggerCtx = (clientX, clientY) => {
      const menuItems = getCommonContextMenuItems(S, ent, id, callbacks, reRender);

      const barItem = S[ent].find(x => x.id === id);
      if (barItem) {
        const groupDef = gdefs.find(g => g.match(barItem));
        if (groupDef) {
          const gidStr = String(groupDef.id ?? '__null');
          const itemOrderKey = `${ent}_${groupBy}_${gidStr}`;
          const rawTargetItems = S[ent].filter(r => groupDef.match(r) && matchSearch(S, coldefs, ent, r));

          if (rawTargetItems.length > 1) {
            S.prefs.tlItemOrder = S.prefs.tlItemOrder || {};
            let currentOrder = S.prefs.tlItemOrder[itemOrderKey] ? [...S.prefs.tlItemOrder[itemOrderKey]] : [];
            currentOrder = currentOrder.filter(itemId => rawTargetItems.some(it => it.id === itemId));
            rawTargetItems.forEach(it => {
              if (!currentOrder.includes(it.id)) currentOrder.push(it.id);
            });

            const idx = currentOrder.indexOf(id);

            const reorderItems = [];
            if (idx > 0) {
              reorderItems.push({
                id: 'moveUp',
                label: 'Переместить выше ▲',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
                action: async () => {
                  const temp = currentOrder[idx];
                  currentOrder[idx] = currentOrder[idx - 1];
                  currentOrder[idx - 1] = temp;
                  S.prefs.tlItemOrder[itemOrderKey] = currentOrder;
                  await savePrefs(S);
                  toast(`«${barItem.name}» перемещена выше`, 'ok');
                  reRender();
                }
              });
            }
            if (idx < currentOrder.length - 1) {
              reorderItems.push({
                id: 'moveDown',
                label: 'Переместить ниже ▼',
                icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>',
                action: async () => {
                  const temp = currentOrder[idx];
                  currentOrder[idx] = currentOrder[idx + 1];
                  currentOrder[idx + 1] = temp;
                  S.prefs.tlItemOrder[itemOrderKey] = currentOrder;
                  await savePrefs(S);
                  toast(`«${barItem.name}» перемещена ниже`, 'ok');
                  reRender();
                }
              });
            }

            if (reorderItems.length) {
              menuItems.splice(2, 0, ...reorderItems, { type: 'divider' });
            }
          }
        }
      }

      showContextMenu({
        preventDefault: () => {},
        stopPropagation: () => {},
        clientX,
        clientY
      }, menuItems);
    };

    bar.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      triggerCtx(e.clientX, e.clientY);
    };

    let touchTimer = null;
    bar.ontouchstart = e => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      touchTimer = setTimeout(() => {
        triggerCtx(touch.clientX, touch.clientY);
      }, 500);
    };
    bar.ontouchend = () => { if (touchTimer) clearTimeout(touchTimer); };
    bar.ontouchmove = () => { if (touchTimer) clearTimeout(touchTimer); };
  });
}

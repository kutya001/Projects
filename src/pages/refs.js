// src/pages/refs.js
import { esc } from '../utils/dom.js';
import { colorOf } from '../utils/color.js';
import { REFTABS } from '../core/state.js';
import { db, refreshAll } from '../core/db.js';
import { confirmBox } from '../ui/modal.js';
import { afterChange, setDbBeacon } from '../utils/logger.js';
import { toast } from '../ui/toast.js';
import { renderTableView } from '../components/table/TableView.js';
import { openQuickChangeModal, getCommonContextMenuItems } from '../services/quickActions.js';
import { showContextMenu } from '../ui/contextMenu.js';
import { renderUnifiedHeader } from '../ui/unifiedHeader.js';

let curTab = 'employees';
let curView = 'table'; // 'table' | 'cards'

export function renderRefsPage(S, mount, callbacks = {}) {
  const tabs = REFTABS.map(([k, name]) => `
    <button data-tab="${k}" class="${curTab === k ? 'on' : ''}">${esc(name)} (${(S[k] || []).length})</button>
  `).join('');

  const activeCount = (S[curTab] || []).length;

  const headerHtml = renderUnifiedHeader(S, {
    title: 'Справочники',
    count: activeCount,
    actions: `
      <div class="view-switch" style="display:inline-flex;background:var(--line2);padding:2px;border-radius:8px;gap:2px">
        <button id="btnViewTable" class="btn sm ${curView === 'table' ? 'pri' : 'ghost'}" title="Представление: Таблица" style="padding:2px 8px;font-size:12px">
          Таблица
        </button>
        <button id="btnViewCards" class="btn sm ${curView === 'cards' ? 'pri' : 'ghost'}" title="Представление: Карточки" style="padding:2px 8px;font-size:12px">
          Карточки
        </button>
      </div>
      <button class="btn pri sm" id="btnAddRef" style="font-weight:700;display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        + Запись
      </button>
    `
  });

  mount.innerHTML = `
    ${headerHtml}
    <div class="refs page-content" style="padding-top:10px">
      <div class="tabs">${tabs}</div>
      <div id="refPanel"></div>
    </div>`;

  const panelEl = mount.querySelector('#refPanel');
  const reRender = () => renderRefsPage(S, mount, callbacks);

  mount.querySelector('#btnViewTable').onclick = () => {
    if (curView !== 'table') {
      curView = 'table';
      reRender();
    }
  };

  mount.querySelector('#btnViewCards').onclick = () => {
    if (curView !== 'cards') {
      curView = 'cards';
      reRender();
    }
  };

  mount.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
    curTab = b.dataset.tab;
    reRender();
  });

  mount.querySelector('#btnAddRef').onclick = () => {
    if (callbacks.onAddDir) callbacks.onAddDir(curTab);
  };

  const refCallbacks = {
    onView: (ent, id) => {
      if (callbacks.onView) callbacks.onView(ent, id);
    },
    onEdit: (ent, id) => {
      if (callbacks.onEditDir) callbacks.onEditDir(ent, id);
    },
    onDelete: (ent, id) => {
      confirmBox('Удалить эту запись из справочника?', async () => {
        try {
          await db[ent].delete(id);
          await refreshAll(S);
          await afterChange(S, callbacks.autoSave);
          toast('Запись удалена из справочника', 'ok');
          reRender();
        } catch (e) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка удаления', 'err');
        }
      });
    },
    autoSave: callbacks.autoSave
  };

  if (curView === 'table') {
    renderTableView(S, curTab, panelEl, refCallbacks);
  } else {
    renderCardsView(S, curTab, panelEl, refCallbacks, reRender);
  }
}

function renderCardsView(S, curTab, mount, refCallbacks, reRender) {
  const items = S[curTab] || [];

  if (!items.length) {
    mount.innerHTML = `<div style="text-align:center;padding:40px 20px;background:#fff;border:1px solid var(--line);border-radius:12px;color:var(--mut)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:36px;height:36px;color:var(--mut2);margin-bottom:8px"><path d="M22 12h-6l-2 3h-4l-2-3H2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-7z"/><path d="M5.45 5.11L2 12v0h20v0l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
      <div>Справочник пуст</div>
    </div>`;
    return;
  }

  const roleText = {
    dev: 'Разработчик',
    agent: 'Агент AI',
    pm: 'Менеджер проекта'
  };

  const roleColor = {
    dev: '#2B6CB0',
    agent: '#6B46C1',
    pm: '#D69E2E'
  };

  const iconPrj = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;display:inline-block;vertical-align:-2px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
  const iconTsk = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;display:inline-block;vertical-align:-2px"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`;
  const iconChg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;display:inline-block;vertical-align:-2px"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

  const cardsHtml = items.map(item => {
    const col = colorOf(item);
    let detailsHtml = '';

    if (curTab === 'customers') {
      const pCount = S.projects.filter(p => p.customerId === item.id).length;
      const tCount = S.tasks.filter(t => t.customerId === item.id).length;
      detailsHtml = `
        <div style="font-size:12.5px;color:var(--ink);margin-bottom:4px"><b>Контакты:</b> ${esc(item.contacts || '—')}</div>
        ${item.desc ? `<div style="font-size:12px;color:var(--mut);margin-bottom:4px">${esc(item.desc)}</div>` : ''}
        <div style="display:flex;gap:12px;font-size:11.5px;color:var(--mut);margin-top:2px">
          <span>${iconPrj} Проектов: <b>${pCount}</b></span>
          <span>${iconTsk} Задач: <b>${tCount}</b></span>
        </div>
      `;
    } else if (curTab === 'employees') {
      const roleName = roleText[item.role] || item.role || 'Сотрудник';
      const rColor = roleColor[item.role] || '#4A5568';
      const pCount = S.projects.filter(p => p.devId === item.id || p.agentId === item.id || (p.devs || []).includes(item.id) || (p.agents || []).includes(item.id)).length;
      const tCount = S.tasks.filter(t => t.devId === item.id || t.agentId === item.id).length;

      detailsHtml = `
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="chip" style="background:${rColor}15;color:${rColor};border:1px solid ${rColor}30;font-weight:600">${esc(roleName)}</span>
          ${item.position ? `<span style="color:var(--mut)">${esc(item.position)}</span>` : ''}
        </div>
        <div style="display:flex;gap:12px;font-size:11.5px;color:var(--mut);margin-top:2px">
          <span>${iconPrj} Проектов: <b>${pCount}</b></span>
          <span>${iconTsk} Задач: <b>${tCount}</b></span>
        </div>
      `;
    } else if (curTab === 'priorities') {
      const pCount = S.projects.filter(p => p.priorityId === item.id).length;
      const tCount = S.tasks.filter(t => t.priorityId === item.id).length;
      const cCount = S.changes.filter(c => c.priorityId === item.id).length;

      detailsHtml = `
        <div>Вес приоритета: <b>${item.weight ?? 0}</b></div>
        <div style="display:flex;gap:12px;font-size:11.5px;color:var(--mut);margin-top:2px">
          <span>${iconPrj} Проектов: <b>${pCount}</b></span>
          <span>${iconTsk} Задач: <b>${tCount}</b></span>
          <span>${iconChg} Изменений: <b>${cCount}</b></span>
        </div>
      `;
    } else if (curTab === 'projectStatuses') {
      const pCount = S.projects.filter(p => p.statusId === item.id).length;
      detailsHtml = `<div>${iconPrj} Проектов в статусе: <b>${pCount}</b></div>`;
    } else if (curTab === 'taskStatuses') {
      const tCount = S.tasks.filter(t => t.statusId === item.id).length;
      const cCount = S.changes.filter(c => c.statusId === item.id).length;
      detailsHtml = `
        <div style="display:flex;gap:12px;font-size:11.5px;color:var(--mut)">
          <span>${iconTsk} Задач: <b>${tCount}</b></span>
          <span>${iconChg} Изменений: <b>${cCount}</b></span>
        </div>
      `;
    } else if (curTab === 'stages') {
      const pCount = S.projects.filter(p => p.stageId === item.id).length;
      detailsHtml = `<div>${iconPrj} Проектов на этапе: <b>${pCount}</b></div>`;
    }

    return `
      <div class="ref-card" data-id="${item.id}" style="border-top:3px solid ${col}">
        <div class="ref-card-head">
          <div class="ref-card-title">
            <span class="sw" style="background:${col}"></span>
            <span>${esc(item.name)}</span>
          </div>
        </div>
        <div class="ref-card-body">
          ${detailsHtml}
        </div>
        <div class="ref-card-foot">
          <button class="btn sm ghost" data-act="view" style="display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Просмотр
          </button>
          <button class="btn sm ghost" data-act="quick" style="display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            Параметры
          </button>
          <button class="btn sm ghost" data-act="edit" style="display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Изменить
          </button>
          <button class="btn sm ghost" data-act="del" style="color:var(--red);display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Удалить
          </button>
        </div>
      </div>
    `;
  }).join('');

  mount.innerHTML = `<div class="ref-cards-grid">${cardsHtml}</div>`;

  mount.querySelectorAll('.ref-card').forEach(card => {
    const id = +card.dataset.id;

    card.onclick = (e) => {
      if (e.target.closest('button')) return;
      if (refCallbacks.onView) refCallbacks.onView(curTab, id);
    };

    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      const menuItems = getCommonContextMenuItems(S, curTab, id, refCallbacks, reRender);
      showContextMenu(e, menuItems);
    });

    card.querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'view') {
          if (refCallbacks.onView) refCallbacks.onView(curTab, id);
        } else if (act === 'quick') {
          openQuickChangeModal(S, curTab, id, {
            autoSave: refCallbacks.autoSave,
            onSuccess: reRender
          });
        } else if (act === 'edit') {
          if (refCallbacks.onEdit) refCallbacks.onEdit(curTab, id);
        } else if (act === 'del') {
          if (refCallbacks.onDelete) refCallbacks.onDelete(curTab, id);
        }
      };
    });
  });
}

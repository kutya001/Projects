// src/pages/changes.js
import { savePrefs } from '../core/prefs.js';
import { renderTableView } from '../components/table/TableView.js';
import { renderKanbanView } from '../components/kanban/KanbanView.js';
import { renderTimelineView } from '../components/timeline/TimelineView.js';
import { VIEW_ICONS } from '../ui/viewIcons.js';
import { exportEntityTemplate } from '../services/storage.js';
import { renderUnifiedHeader } from '../ui/unifiedHeader.js';

export function renderChangesPage(S, mount, callbacks = {}) {
  const ent = 'changes';
  const vMode = S.prefs.views[ent] || 'tbl';

  const headerHtml = renderUnifiedHeader(S, {
    title: 'Изменения',
    count: S.changes.length,
    actions: `
      <button class="btn sm" id="btnExportChgTemplate" title="Выгрузить JSON шаблон импорта изменений со справочниками" style="display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Шаблон импорта
      </button>
      <button class="btn pri sm" id="btnAddChg" style="font-weight:700;display:inline-flex;align-items:center;gap:4px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        + Изменение
      </button>
    `,
    views: { ent: 'c', current: vMode }
  });

  mount.innerHTML = `
    ${headerHtml}
    <div id="cContent" class="page-content"></div>`;

  const cnt = mount.querySelector('#cContent');
  const reRender = () => renderChangesPage(S, mount, callbacks);

  if (vMode === 'tbl') renderTableView(S, ent, cnt, callbacks);
  else if (vMode === 'kb') renderKanbanView(S, ent, cnt, callbacks);
  else renderTimelineView(S, ent, cnt, callbacks);

  mount.querySelectorAll('#cViewSeg button').forEach(b => b.onclick = async () => {
    S.prefs.views[ent] = b.dataset.v;
    await savePrefs(S);
    reRender();
  });

  const btnTemplate = mount.querySelector('#btnExportChgTemplate');
  if (btnTemplate) {
    btnTemplate.onclick = () => exportEntityTemplate(S, 'changes');
  }

  const btnAdd = mount.querySelector('#btnAddChg');
  if (btnAdd) {
    btnAdd.onclick = () => {
      if (callbacks.onAdd) callbacks.onAdd('changes');
    };
  }
}

// src/pages/projects.js
import { ENT } from '../core/state.js';
import { savePrefs } from '../core/prefs.js';
import { renderTableView } from '../components/table/TableView.js';
import { renderKanbanView } from '../components/kanban/KanbanView.js';
import { renderTimelineView } from '../components/timeline/TimelineView.js';
import { VIEW_ICONS } from '../ui/viewIcons.js';
import { exportEntityTemplate } from '../services/storage.js';

export function renderProjectsPage(S, mount, callbacks = {}) {
  const ent = 'projects';
  const vMode = S.prefs.views[ent] || 'tbl';

  mount.innerHTML = `
    <div class="phead">
      <div><div class="kick">Реестр проектов</div><h1>Проекты</h1></div>
      <span class="big-n">${S.projects.length}</span>
      <div class="sp"></div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <button class="btn sm" id="btnExportPrjTemplate" title="Выгрузить JSON шаблон импорта проектов со справочниками" style="display:inline-flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Шаблон импорта
        </button>
        <div class="seg" id="pViewSeg">
          <button data-v="tbl" class="${vMode === 'tbl' ? 'on' : ''}">${VIEW_ICONS.tbl} Таблица</button>
          <button data-v="kb" class="${vMode === 'kb' ? 'on' : ''}">${VIEW_ICONS.kb} Канбан</button>
          <button data-v="tl" class="${vMode === 'tl' ? 'on' : ''}">${VIEW_ICONS.tl} Гант</button>
        </div>
        <button class="btn pri" id="btnAddPrj" style="font-weight:700;display:inline-flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Добавить проект
        </button>
      </div>
    </div>
    <div id="pContent"></div>`;

  const cnt = mount.querySelector('#pContent');
  const reRender = () => renderProjectsPage(S, mount, callbacks);

  if (vMode === 'tbl') renderTableView(S, ent, cnt, callbacks);
  else if (vMode === 'kb') renderKanbanView(S, ent, cnt, callbacks);
  else renderTimelineView(S, ent, cnt, callbacks);

  mount.querySelectorAll('#pViewSeg button').forEach(b => b.onclick = async () => {
    S.prefs.views[ent] = b.dataset.v;
    await savePrefs(S);
    reRender();
  });

  const btnTemplate = mount.querySelector('#btnExportPrjTemplate');
  if (btnTemplate) {
    btnTemplate.onclick = () => exportEntityTemplate(S, 'projects');
  }

  const btnAdd = mount.querySelector('#btnAddPrj');
  if (btnAdd) {
    btnAdd.onclick = () => {
      if (callbacks.onAdd) callbacks.onAdd('projects');
    };
  }
}

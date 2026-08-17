// src/components/table/subRows.js
import { cellHtml } from './renderers.js';

export function visOf(defs) {
  return defs.filter(c => ['num', 'name', 'statusId', 'priorityId', 'devId', 'start', 'end'].includes(c.k));
}

export function subRowHtml(S, coldefs, ent, r) {
  const cols = visOf(coldefs[ent === 'projects' ? 'tasks' : 'changes']);
  const kids = ent === 'projects'
    ? S.tasks.filter(t => t.projectId === r.id)
    : S.changes.filter(c => c.taskId === r.id);
  const childEnt = ent === 'projects' ? 'tasks' : 'changes';

  const rowsHtml = kids.length
    ? kids.map(k => `<tr data-cid="${k.id}" data-cent="${childEnt}" class="sub-rw" style="cursor:pointer">${cols.map(c => `<td>${cellHtml(S, childEnt, c, k)}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${cols.length}" style="color:var(--mut2);padding:12px">Пока пусто</td></tr>`;

  const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };
  const canAddSub = (ent === 'projects' && mods.tasks) || (ent === 'tasks' && mods.changes);

  return `<tr class="subrow"><td colspan="99"><div class="subpad">
    <div class="stt" style="display:flex;align-items:center;justify-content:space-between">
      <span>${ent === 'projects' ? 'Задачи проекта' : 'Изменения задачи'} · <b class="mono">${kids.length}</b></span>
      ${canAddSub ? `<button class="btn sm pri" data-addsub="${r.id}" data-parentent="${ent}">➕ Добавить ${ent === 'projects' ? 'задачу' : 'изменение'}</button>` : ''}
    </div>
    <table class="mini-t">${rowsHtml}</table></div></td></tr>`;
}

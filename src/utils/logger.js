// src/utils/logger.js
import { $ } from './dom.js';
import { fmtDT, nowIso } from './date.js';
import { db } from '../core/db.js';

export function setDbBeacon(state, text) {
  const el = $('#dbBeacon');
  if (!el) return;
  el.className = 'beacon ' + (state === 'saved' ? 'ok' : state === 'error' ? 'err' : state === 'dirty' ? 'warn' : '');
  const txt = el.querySelector('.txt');
  if (txt) txt.textContent = text;
}

export function updateBackupBeacon(S) {
  const el = $('#bkBeacon');
  if (!el) return;
  if (!S.lastExport) {
    el.className = 'beacon err';
    el.querySelector('.txt').textContent = 'Резервная копия отсутствует';
  } else if (S.lastSaved && S.lastSaved > S.lastExport) {
    el.className = 'beacon warn';
    el.querySelector('.txt').textContent = 'После последнего экспорта есть изменения';
  } else {
    el.className = 'beacon ok';
    el.querySelector('.txt').textContent = 'Резервная копия актуальна';
  }
  const sbExport = $('#sbExport');
  if (sbExport) sbExport.textContent = S.lastExport ? fmtDT(S.lastExport) : '—';
}

export function updateCounts(S) {
  const cntP = $('#cnt-p');
  const cntT = $('#cnt-t');
  const cntC = $('#cnt-c');
  const cntL = $('#cnt-l');
  const cntSh = $('#cnt-sh');
  const sbCount = $('#sbCount');
  const sbSplit = $('#sbSplit');

  const shCount = (S.stageHistory && S.stageHistory.length ? S.stageHistory : (S.history || [])).length;

  if (cntP) cntP.textContent = S.projects.length;
  if (cntT) cntT.textContent = S.tasks.length;
  if (cntC) cntC.textContent = S.changes.length;
  if (cntL) cntL.textContent = (S.auditLogs || []).length;
  if (cntSh) cntSh.textContent = shCount;
  if (sbCount) sbCount.textContent = S.projects.length + S.tasks.length + S.changes.length;
  if (sbSplit) sbSplit.textContent = `· П:${S.projects.length} З:${S.tasks.length} И:${S.changes.length}`;
}

export async function afterChange(S, autoSaveCallback) {
  S.lastSaved = nowIso();
  try {
    await db.meta.put({ key: 'lastSaved', value: S.lastSaved });
  } catch (e) {}
  setDbBeacon('saved', '🟢 Данные сохранены на сервере');
  const sbSaved = $('#sbSaved');
  if (sbSaved) sbSaved.textContent = fmtDT(S.lastSaved);
  updateBackupBeacon(S);
  updateCounts(S);
  if (autoSaveCallback) autoSaveCallback();
}

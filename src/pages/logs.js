// src/pages/logs.js
import { renderTableView } from '../components/table/TableView.js';
import { db, refreshAll } from '../core/db.js';
import { toast } from '../ui/toast.js';
import { confirmBox } from '../ui/modal.js';
import { nowIso } from '../utils/date.js';
import { openViewModal } from './forms/ViewForm.js';

export function navigateToLogTarget(S, entity, targetStr, logItem = {}, callbacks = {}) {
  if (!entity || !S[entity]) {
    toast('Модуль «' + (entity || '—') + '» не найден в базе', 'warn');
    return;
  }

  const list = S[entity] || [];
  let found = null;

  // 1. Try finding by details.id or targetId
  const directId = logItem?.details?.id || logItem?.targetId;
  if (directId != null) {
    found = list.find(x => x.id === directId || x.key === directId);
  }

  // 2. Try parsing ID if target is "ID 5" or "#5" or number
  if (!found && targetStr) {
    const idMatch = targetStr.match(/^(?:ID\s*|#)(\d+)$/i);
    if (idMatch) {
      const parsedId = +idMatch[1];
      found = list.find(x => x.id === parsedId);
    }
  }

  // 3. Try parsing code/num (e.g. "P-001 · ..." or "P-001")
  if (!found && targetStr) {
    const codeMatch = targetStr.match(/^([A-Za-zА-Яа-я0-9\-_.]+)(?:\s*·\s*|$)/);
    if (codeMatch) {
      const code = codeMatch[1].trim();
      found = list.find(x => x.num && x.num.toLowerCase() === code.toLowerCase());
    }
  }

  // 4. Try exact match by name or num
  if (!found && targetStr) {
    found = list.find(x => x.name === targetStr || (x.num && (x.num + ' · ' + x.name) === targetStr) || String(x.id) === targetStr || x.num === targetStr);
  }

  // 5. Try case-insensitive substring match on name
  if (!found && targetStr) {
    const cleanTarget = targetStr.replace(/^[A-Za-z0-9\-_.]+\s*·\s*/, '').trim().toLowerCase();
    if (cleanTarget) {
      found = list.find(x => (x.name || '').toLowerCase() === cleanTarget);
    }
  }

  if (found) {
    openViewModal(S, entity, found.id != null ? found.id : found.key, callbacks);
  } else {
    toast(`Объект «${targetStr || entity}» не найден (возможно, он был удалён)`, 'warn');
  }
}

import { renderUnifiedHeader } from '../ui/unifiedHeader.js';

export function renderLogsPage(S, mount, callbacks = {}) {
  const ent = 'auditLogs';
  const logsCount = (S.auditLogs || []).length;

  const headerHtml = renderUnifiedHeader(S, {
    title: 'Журнал действий',
    count: logsCount,
    actions: `
      <button class="btn sm" id="btnExportLogsJson" title="Экспорт журнала в JSON">JSON</button>
      <button class="btn sm" id="btnExportLogsCsv" title="Экспорт журнала в CSV">CSV</button>
      <button class="btn sm" id="btnRefreshLogsPage" title="Обновить журнал">Обновить</button>
      <button class="btn sm dgr" id="btnClearLogsPage" style="background:#FFF5F5;border-color:#FEB2B2;color:#C53030" title="Очистить весь журнал действий">Очистить</button>
    `
  });

  mount.innerHTML = `
    ${headerHtml}
    <div id="logsContent" class="page-content"></div>`;

  const cnt = mount.querySelector('#logsContent');
  const reRender = () => renderLogsPage(S, mount, callbacks);

  // Event delegation for clicking target links
  cnt.addEventListener('click', e => {
    const btn = e.target.closest('.log-target-btn');
    if (btn) {
      e.stopPropagation();
      const entity = btn.dataset.logEnt;
      const targetStr = btn.dataset.logTarget;
      const logId = +btn.dataset.logId;
      const logItem = (S.auditLogs || []).find(l => l.id === logId);
      navigateToLogTarget(S, entity, targetStr, logItem, callbacks);
    }
  });

  // Render Table View for auditLogs
  renderTableView(S, ent, cnt, {
    ...callbacks,
    onDelete: async (entity, id) => {
      confirmBox('Удалить эту запись из журнала аудита?', async () => {
        try {
          await db.auditLogs.delete(id);
          await refreshAll(S);
          toast('Запись удалена', 'ok');
          reRender();
        } catch (e) {
          toast('Ошибка удаления записи: ' + e.message, 'err');
        }
      });
    }
  });

  // Refresh
  const btnRefresh = mount.querySelector('#btnRefreshLogsPage');
  if (btnRefresh) {
    btnRefresh.onclick = async () => {
      try {
        btnRefresh.disabled = true;
        btnRefresh.textContent = '⏳ Обновление...';
        await refreshAll(S);
        toast('Журнал действий обновлен', 'ok');
        reRender();
      } catch (e) {
        toast('Ошибка обновления журнала: ' + e.message, 'err');
      } finally {
        if (btnRefresh) {
          btnRefresh.disabled = false;
          btnRefresh.textContent = '🔄 Обновить';
        }
      }
    };
  }

  // Clear all logs
  const btnClear = mount.querySelector('#btnClearLogsPage');
  if (btnClear) {
    btnClear.onclick = () => {
      confirmBox('Вы действительно хотите полностью очистить журнал действий и подключений? Это действие необратимо.', async () => {
        try {
          await db.clearLogs();
          await refreshAll(S);
          toast('Журнал действий успешно очищен', 'ok');
          reRender();
        } catch (e) {
          toast('Ошибка очистки журнала: ' + e.message, 'err');
        }
      });
    };
  }

  // Export JSON
  const btnExportJson = mount.querySelector('#btnExportLogsJson');
  if (btnExportJson) {
    btnExportJson.onclick = () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(S.auditLogs || [], null, 2));
      const a = document.createElement('a');
      a.setAttribute('href', dataStr);
      a.setAttribute('download', `Audit_Logs_${nowIso().slice(0, 10)}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('Экспорт JSON сформирован', 'ok');
    };
  }

  // Export CSV
  const btnExportCsv = mount.querySelector('#btnExportLogsCsv');
  if (btnExportCsv) {
    btnExportCsv.onclick = () => {
      const headers = ['ID', 'Дата и время', 'IP-адрес', 'Действие', 'Модуль', 'Объект / Запись', 'Поле', 'Детали', 'User-Agent'];
      const rows = (S.auditLogs || []).map(r => [
        r.id,
        r.ts,
        r.ip,
        r.action,
        r.entity,
        `"${(r.target || '').replace(/"/g, '""')}"`,
        `"${(r.field || '').replace(/"/g, '""')}"`,
        `"${(JSON.stringify(r.details || {})).replace(/"/g, '""')}"`,
        `"${(r.userAgent || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(e => e.join(';'))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', `Audit_Logs_${nowIso().slice(0, 10)}.csv`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast('Экспорт CSV сформирован', 'ok');
    };
  }
}

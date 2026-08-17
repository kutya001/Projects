// src/pages/stageHistory.js
import { esc } from '../utils/dom.js';
import { db, refreshAll } from '../core/db.js';
import { toast } from '../ui/toast.js';
import { confirmBox } from '../ui/modal.js';
import { afterChange } from '../utils/logger.js';
import { renderTableView } from '../components/table/TableView.js';
import { openViewModal } from './forms/ViewForm.js';

export function renderStageHistoryPage(S, mount, callbacks = {}) {
  const hist = (S.stageHistory && S.stageHistory.length ? S.stageHistory : (S.history || []));

  // Calculate summary KPIs
  let totalPos = 0;
  let totalNeg = 0;
  const touchedProjectIds = new Set();

  hist.forEach(h => {
    const d = (h.to || 0) - (h.from || 0);
    if (d > 0) totalPos += d;
    else if (d < 0) totalNeg += d;
    if (h.projectId) touchedProjectIds.add(h.projectId);
  });

  const netDelta = totalPos + totalNeg;

  mount.innerHTML = `
    <div class="phead">
      <div>
        <div class="kick">Аналитика и аудит прогресса</div>
        <h1>Журнал изменения этапов</h1>
      </div>
      <div class="sp"></div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <button class="btn sm" id="btnExportHistCsv" style="display:inline-flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Экспорт CSV
        </button>
        <button class="btn sm" id="btnExportHistJson" style="display:inline-flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"/></svg>
          Экспорт JSON
        </button>
        <button class="btn sm dgr" id="btnClearStageHist" style="display:inline-flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Очистить журнал
        </button>
      </div>
    </div>

    <!-- Summary KPI Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:16px">
      <div style="background:#fff;padding:12px 14px;border-radius:10px;border:1px solid var(--line);box-shadow:var(--sh)">
        <div style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;letter-spacing:0.04em">Всего записей</div>
        <div style="font-size:20px;font-weight:800;color:var(--ink);margin-top:2px" class="mono">${hist.length}</div>
      </div>
      <div style="background:#fff;padding:12px 14px;border-radius:10px;border:1px solid var(--line);box-shadow:var(--sh)">
        <div style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;letter-spacing:0.04em">Суммарный прирост</div>
        <div style="font-size:20px;font-weight:800;color:#2F9E63;margin-top:2px" class="mono">+${totalPos}%</div>
      </div>
      <div style="background:#fff;padding:12px 14px;border-radius:10px;border:1px solid var(--line);box-shadow:var(--sh)">
        <div style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;letter-spacing:0.04em">Суммарное снижение</div>
        <div style="font-size:20px;font-weight:800;color:#E03131;margin-top:2px" class="mono">${totalNeg}%</div>
      </div>
      <div style="background:#fff;padding:12px 14px;border-radius:10px;border:1px solid var(--line);box-shadow:var(--sh)">
        <div style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;letter-spacing:0.04em">Чистая динамика</div>
        <div style="font-size:20px;font-weight:800;color:${netDelta >= 0 ? '#0B7285' : '#C92A2A'};margin-top:2px" class="mono">${netDelta >= 0 ? '+' + netDelta : netDelta}%</div>
      </div>
      <div style="background:#fff;padding:12px 14px;border-radius:10px;border:1px solid var(--line);box-shadow:var(--sh)">
        <div style="font-size:11px;color:var(--mut);text-transform:uppercase;font-weight:700;letter-spacing:0.04em">Проектов затронуто</div>
        <div style="font-size:20px;font-weight:800;color:var(--ink);margin-top:2px" class="mono">${touchedProjectIds.size}</div>
      </div>
    </div>

    <!-- Table Container -->
    <div id="stageHistTableWrap"></div>
  `;

  const tableWrapEl = mount.querySelector('#stageHistTableWrap');
  const reRender = () => renderStageHistoryPage(S, mount, callbacks);

  // Export CSV
  const btnCsv = mount.querySelector('#btnExportHistCsv');
  if (btnCsv) {
    btnCsv.onclick = () => {
      if (!hist.length) {
        toast('Журнал пуст', 'warn');
        return;
      }
      const headers = ['ID', 'Дата и время', 'Код проекта', 'Проект', 'Этап', 'Было %', 'Стало %', 'Дельта %'];
      const lines = [headers.join(';')];
      hist.forEach(h => {
        const pj = (S.projects || []).find(p => p.id === h.projectId);
        const stg = (S.stages || []).find(s => s.id === h.stageId);
        const delta = (h.to || 0) - (h.from || 0);
        lines.push([
          h.id || '',
          `"${h.ts || ''}"`,
          `"${pj?.num || ''}"`,
          `"${(pj?.name || '').replace(/"/g, '""')}"`,
          `"${(stg?.name || '').replace(/"/g, '""')}"`,
          h.from ?? 0,
          h.to ?? 0,
          delta > 0 ? `+${delta}` : delta
        ].join(';'));
      });
      const bom = '\uFEFF';
      const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stage_history_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('CSV файл журнала выгружен', 'ok');
    };
  }

  // Export JSON
  const btnJson = mount.querySelector('#btnExportHistJson');
  if (btnJson) {
    btnJson.onclick = () => {
      if (!hist.length) {
        toast('Журнал пуст', 'warn');
        return;
      }
      const blob = new Blob([JSON.stringify(hist, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stage_history_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast('JSON файл журнала выгружен', 'ok');
    };
  }

  // Clear History
  const btnClr = mount.querySelector('#btnClearStageHist');
  if (btnClr) {
    btnClr.onclick = () => {
      confirmBox('Вы уверены, что хотите полностью очистить журнал изменения этапов?', async () => {
        try {
          await db.stageHistory.clear();
          await refreshAll(S);
          if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
          toast('Журнал этапов успешно очищен', 'ok');
          reRender();
        } catch (e) {
          toast('Ошибка очистки: ' + e.message, 'err');
        }
      });
    };
  }

  // Stage callbacks for TableView
  const stageCallbacks = {
    onView: (ent, id) => {
      const record = hist.find(x => x.id === id);
      if (record && record.projectId) {
        openViewModal(S, 'projects', record.projectId, callbacks);
      }
    },
    onDelete: (ent, id) => {
      confirmBox('Удалить эту запись из журнала этапов?', async () => {
        try {
          await db.stageHistory.delete(id);
          await refreshAll(S);
          if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
          toast('Запись удалена', 'ok');
          reRender();
        } catch (e) {
          toast('Ошибка удаления: ' + e.message, 'err');
        }
      });
    },
    autoSave: callbacks.autoSave
  };

  // Render using standard TableView
  renderTableView(S, 'stageHistory', tableWrapEl, stageCallbacks);
}

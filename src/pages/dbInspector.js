import { esc } from '../utils/dom.js';
import { db, refreshAll } from '../core/db.js';
import { toast } from '../ui/toast.js';
import { modal, confirmBox } from '../ui/modal.js';
import { popover } from '../ui/popover.js';
import { afterChange } from '../utils/logger.js';
import { nowIso } from '../utils/date.js';
import { renderUnifiedHeader } from '../ui/unifiedHeader.js';

let activeTable = 'projects';
let activeMode = 'table'; // 'table' | 'sql'
let sqlResult = null;
let sqlQueryText = 'SELECT * FROM projects LIMIT 50;';

export const TABLE_DESCRIPTIONS = {
  projects: 'Основной реестр проектов, сроки, этапы, ответственные лица и статус выполнения',
  tasks: 'Реестр задач в рамках проектов, исполнители, приоритеты и связи',
  changes: 'Журнал изменений и правок (Change Requests) по задачам',
  employees: 'Справочник сотрудников (разработчики, агенты, менеджеры проектов) с признаком активности',
  customers: 'Справочник компаний-заказчиков и контактных лиц',
  priorities: 'Справочник приоритетов (Критический, Высокий, Средний, Низкий) с весовыми коэффициентами',
  taskStatuses: 'Статусы жизненного цикла задач и канбан-колонок',
  projectStatuses: 'Глобальные статусы состояния проектов (В работе, Пауза, Завершён)',
  stages: 'Справочник этапов проектов (Аналитика, Дизайн, Бэкенд, Фронтенд, Тестирование, Деплой)',
  stageHistory: 'Хронологический журнал фиксации динамики прогресса по этапам проектов',
  kanbanBoards: 'Конфигурации колонок и WIP-лимитов для Канбан-досок',
  formLayouts: 'Кастомные макеты расположения полей и конструктор форм',
  auditLogs: 'Системный журнал аудита действий пользователей (создание, изменение, удаление, IP-адреса)',
  meta: 'Системные настройки, метаданные и глобальные конфигурации'
};

const JSON_FIELDS = {
  projects: ['stageProgress', 'agents', 'devs', 'checklists', 'notes'],
  tasks: ['agents', 'devs', 'checklists', 'notes'],
  changes: ['agents', 'devs', 'checklists', 'notes'],
  kanbanBoards: ['columns', 'wipLimits'],
  formLayouts: ['layout'],
  meta: ['value']
};

export const RAW_TABLE_COLUMNS = {
  projects: ['id', 'num', 'name', 'statusId', 'priorityId', 'stageId', 'customerId', 'devId', 'agentId', 'start', 'end', 'stageProgress', 'agents', 'devs', 'createdAt', 'updatedAt', 'desc', 'note'],
  tasks: ['id', 'num', 'name', 'projectId', 'statusId', 'priorityId', 'devId', 'agentId', 'customerId', 'extNum', 'extLink', 'start', 'end', 'agents', 'devs', 'createdAt', 'updatedAt', 'desc', 'note'],
  changes: ['id', 'num', 'name', 'taskId', 'statusId', 'priorityId', 'devId', 'agentId', 'customerId', 'extNum', 'extLink', 'start', 'end', 'agents', 'devs', 'createdAt', 'updatedAt', 'desc', 'note'],
  employees: ['id', 'name', 'role', 'position', 'color', 'active', 'desc', 'note'],
  customers: ['id', 'name', 'contacts', 'desc', 'note'],
  priorities: ['id', 'name', 'color', 'weight', 'desc', 'note'],
  taskStatuses: ['id', 'name', 'color', 'order', 'desc', 'note'],
  projectStatuses: ['id', 'name', 'color', 'desc', 'note'],
  stages: ['id', 'name', 'color', 'order', 'desc', 'note'],
  stageHistory: ['id', 'projectId', 'stageId', 'from', 'to', 'ts'],
  kanbanBoards: ['id', 'module', 'name', 'columns', 'wipLimits', 'createdAt', 'updatedAt'],
  formLayouts: ['key', 'layout', 'updatedAt'],
  auditLogs: ['id', 'ts', 'ip', 'action', 'entity', 'target', 'field', 'details', 'userAgent'],
  meta: ['key', 'value']
};

const RAW_TABLE_STATE = {};
const FUNNEL_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:11px;height:11px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>';

function getRawTableState(tbl) {
  if (!RAW_TABLE_STATE[tbl]) {
    RAW_TABLE_STATE[tbl] = {
      sort: { k: tbl === 'meta' || tbl === 'formLayouts' ? 'key' : 'id', d: 1 },
      filters: {},
      search: '',
      showAll: false,
      selected: new Set()
    };
  }
  return RAW_TABLE_STATE[tbl];
}

export async function renderDbInspectorPage(S, mount, callbacks = {}) {
  // Fetch SQLite Schema
  let schemaData = null;
  try {
    const res = await fetch('/api/db/schema');
    if (res.ok) schemaData = await res.json();
  } catch (e) {
    console.error('Failed to load DB schema:', e);
  }

  const tables = schemaData?.tables || [
    { name: 'projects', count: (S.projects || []).length },
    { name: 'tasks', count: (S.tasks || []).length },
    { name: 'changes', count: (S.changes || []).length },
    { name: 'employees', count: (S.employees || []).length },
    { name: 'customers', count: (S.customers || []).length },
    { name: 'priorities', count: (S.priorities || []).length },
    { name: 'taskStatuses', count: (S.taskStatuses || []).length },
    { name: 'projectStatuses', count: (S.projectStatuses || []).length },
    { name: 'stages', count: (S.stages || []).length },
    { name: 'stageHistory', count: (S.stageHistory || S.history || []).length },
    { name: 'kanbanBoards', count: (S.kanbanBoards || []).length },
    { name: 'formLayouts', count: (S.formLayouts || []).length },
    { name: 'auditLogs', count: (S.auditLogs || []).length },
    { name: 'meta', count: 0 }
  ];

  const curTableDesc = TABLE_DESCRIPTIONS[activeTable] || 'Таблица базы данных SQLite';
  const curTableCount = (S[activeTable] || []).length;

  const headerHtml = renderUnifiedHeader(S, {
    title: 'Инспектор БД',
    count: tables.length,
    actions: `
      <div class="view-switch" style="display:inline-flex;background:var(--line2);padding:2px;border-radius:8px;gap:2px">
        <button id="btnModeTable" class="btn sm ${activeMode === 'table' ? 'pri' : 'ghost'}" style="padding:2px 8px;font-size:12px">
          Таблица
        </button>
        <button id="btnModeSql" class="btn sm ${activeMode === 'sql' ? 'pri' : 'ghost'}" style="padding:2px 8px;font-size:12px">
          SQL Консоль
        </button>
      </div>
    `
  });

  mount.innerHTML = `
    ${headerHtml}
    <div class="page-content" style="padding-top:10px">
      <div class="db-inspector-container">
      <!-- Sidebar Table List -->
      <div class="db-sidebar">
        <div style="font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;padding:0 4px">
          Таблицы базы данных (${tables.length})
        </div>
        <div class="db-table-nav">
          ${tables.map(t => {
            const count = (S[t.name] || []).length;
            const isAct = t.name === activeTable;
            const desc = TABLE_DESCRIPTIONS[t.name] || '';
            return `
              <button class="db-nav-item ${isAct ? 'active' : ''}" data-tbl="${t.name}" title="${esc(desc)}" style="display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:8px 10px;border-radius:8px;border:none;background:${isAct ? '#EBF8FA' : 'transparent'};color:${isAct ? 'var(--acc)' : 'var(--ink)'};cursor:pointer;font-size:13px;font-weight:${isAct ? '700' : '500'};transition:all 0.12s">
                <span class="mono" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</span>
                <span class="chip mono" style="font-size:11px;padding:1px 6px;background:${isAct ? 'var(--acc)' : 'rgba(0,0,0,0.05)'};color:${isAct ? '#fff' : 'var(--mut)'}">${count}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Main Content Panel -->
      <div class="db-main" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">
        ${activeMode === 'table' ? `
          <!-- Table Header Banner with Description -->
          <div style="background:#fff;padding:14px 18px;border-radius:12px;border:1px solid var(--line);box-shadow:var(--sh);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:240px">
              <div style="display:flex;align-items:center;gap:8px">
                <h2 style="margin:0;font-size:18px;font-family:'JetBrains Mono',monospace;color:var(--ink)">${esc(activeTable)}</h2>
                <span class="chip mono" style="font-size:11.5px;font-weight:700;background:#EBF8FA;color:var(--acc)">${curTableCount} записей</span>
              </div>
              <div style="font-size:13px;color:var(--mut);margin-top:4px;line-height:1.4">
                ${esc(curTableDesc)}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <button class="btn sm pri" id="btnAddRecord" style="font-weight:700;display:inline-flex;align-items:center;gap:4px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Добавить запись
              </button>
              <button class="btn sm" id="btnExportTblJson" style="display:inline-flex;align-items:center;gap:4px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"/></svg>
                JSON
              </button>
              <button class="btn sm" id="btnExportTblCsv" style="display:inline-flex;align-items:center;gap:4px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                CSV
              </button>
              <button class="btn sm dgr" id="btnClearTbl" style="display:inline-flex;align-items:center;gap:4px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Очистить
              </button>
            </div>
          </div>

          <!-- Pure Raw Database Table View -->
          <div id="inspectorTableWrap"></div>
        ` : `
          <!-- SQL Console -->
          <div style="background:#fff;padding:16px;border-radius:12px;border:1px solid var(--line);box-shadow:var(--sh);display:flex;flex-direction:column;gap:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:14px;font-weight:700;color:var(--ink)">SQL Редактор</span>
              <div style="display:flex;gap:6px;align-items:center">
                <span class="mono" style="font-size:11.5px;color:var(--mut)">Ctrl+Enter для выполнения</span>
                <button class="btn sm pri" id="btnRunSql" style="font-weight:700;display:inline-flex;align-items:center;gap:4px">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  Выполнить
                </button>
              </div>
            </div>

            <!-- Templates -->
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn sm" data-sql-tpl="SELECT * FROM ${activeTable} LIMIT 50;">SELECT * FROM ${activeTable}</button>
              <button class="btn sm" data-sql-tpl="SELECT count(*) as total FROM ${activeTable};">COUNT(*)</button>
              <button class="btn sm" data-sql-tpl="PRAGMA table_info(${activeTable});">PRAGMA table_info</button>
              <button class="btn sm" data-sql-tpl="PRAGMA integrity_check;">integrity_check</button>
            </div>

            <textarea id="sqlQueryInput" class="ipt mono" rows="5" style="width:100%;font-size:13px;line-height:1.45;background:#1E293B;color:#F8FAFC;border:none;border-radius:8px;padding:12px;resize:vertical">${esc(sqlQueryText)}</textarea>

            <div id="sqlResultWrap" style="margin-top:10px"></div>
          </div>
        `}
      </div>
    </div>
  `;

  const reRender = () => renderDbInspectorPage(S, mount, callbacks);

  // Switch modes
  const btnModeTable = mount.querySelector('#btnModeTable');
  const btnModeSql = mount.querySelector('#btnModeSql');
  if (btnModeTable) {
    btnModeTable.onclick = () => {
      if (activeMode !== 'table') {
        activeMode = 'table';
        reRender();
      }
    };
  }
  if (btnModeSql) {
    btnModeSql.onclick = () => {
      if (activeMode !== 'sql') {
        activeMode = 'sql';
        reRender();
      }
    };
  }

  // Switch tables
  mount.querySelectorAll('.db-nav-item').forEach(b => {
    b.onclick = () => {
      activeTable = b.dataset.tbl;
      sqlQueryText = `SELECT * FROM ${activeTable} LIMIT 50;`;
      reRender();
    };
  });

  // If in table mode, render Pure Raw DB Table
  if (activeMode === 'table') {
    const tableWrap = mount.querySelector('#inspectorTableWrap');
    if (tableWrap) {
      renderRawDbTable(S, activeTable, tableWrap, {
        onView: (ent, id) => openJsonViewer(S, activeTable, id),
        onEdit: (ent, id) => openRecordEditor(S, activeTable, id, callbacks, reRender),
        onDelete: (ent, id) => {
          confirmBox(`Удалить эту запись из таблицы «${activeTable}»?`, async () => {
            try {
              if (activeTable === 'meta') {
                await fetch(`/api/meta/${id}`, { method: 'DELETE' });
              } else if (db[activeTable]) {
                await db[activeTable].delete(id);
              }
              await refreshAll(S);
              if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
              toast('Запись удалена', 'ok');
              reRender();
            } catch (e) {
              toast('Ошибка удаления: ' + e.message, 'err');
            }
          });
        },
        onBulkDelete: async (ent, ids) => {
          confirmBox(`Удалить выбранные записи (${ids.length}) из таблицы «${activeTable}»?`, async () => {
            try {
              for (const id of ids) {
                if (activeTable === 'meta') {
                  await fetch(`/api/meta/${id}`, { method: 'DELETE' });
                } else if (db[activeTable]) {
                  await db[activeTable].delete(id);
                }
              }
              getRawTableState(activeTable).selected.clear();
              await refreshAll(S);
              if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
              toast(`Удалено записей: ${ids.length}`, 'ok');
              reRender();
            } catch (e) {
              toast('Ошибка удаления: ' + e.message, 'err');
            }
          });
        },
        autoSave: callbacks.autoSave
      });
    }

    // Add record
    const btnAdd = mount.querySelector('#btnAddRecord');
    if (btnAdd) {
      btnAdd.onclick = () => {
        openRecordEditor(S, activeTable, null, callbacks, reRender);
      };
    }

    // Export JSON
    const btnExpJson = mount.querySelector('#btnExportTblJson');
    if (btnExpJson) {
      btnExpJson.onclick = () => {
        const rows = S[activeTable] || [];
        const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeTable}_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast(`Таблица ${activeTable} выгружена в JSON`, 'ok');
      };
    }

    // Export CSV
    const btnExpCsv = mount.querySelector('#btnExportTblCsv');
    if (btnExpCsv) {
      btnExpCsv.onclick = () => {
        const rows = S[activeTable] || [];
        if (!rows.length) {
          toast('Таблица пуста', 'warn');
          return;
        }
        const keys = Object.keys(rows[0]);
        const lines = [keys.join(';')];
        rows.forEach(r => {
          lines.push(keys.map(k => {
            const val = r[k];
            if (typeof val === 'object' && val !== null) {
              return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
            }
            return `"${String(val ?? '').replace(/"/g, '""')}"`;
          }).join(';'));
        });
        const bom = '\uFEFF';
        const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeTable}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast(`Таблица ${activeTable} выгружена в CSV`, 'ok');
      };
    }

    // Clear Table
    const btnClr = mount.querySelector('#btnClearTbl');
    if (btnClr) {
      btnClr.onclick = () => {
        confirmBox(`Вы действительно хотите ОЧИСТИТЬ всю таблицу «${activeTable}»? Это действие необратимо.`, async () => {
          try {
            if (db[activeTable]) {
              await db[activeTable].clear();
            } else {
              await fetch(`/api/${activeTable}`, { method: 'DELETE' });
            }
            await refreshAll(S);
            if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
            toast(`Таблица ${activeTable} очищена`, 'ok');
            reRender();
          } catch (e) {
            toast('Ошибка очистки: ' + e.message, 'err');
          }
        });
      };
    }
  }

  // If in SQL Console mode
  if (activeMode === 'sql') {
    const tx = mount.querySelector('#sqlQueryInput');
    const btnRun = mount.querySelector('#btnRunSql');
    const resWrap = mount.querySelector('#sqlResultWrap');

    const executeSql = async () => {
      const sql = tx.value.trim();
      if (!sql) return;
      sqlQueryText = sql;
      resWrap.innerHTML = '<div style="color:var(--mut);padding:12px;font-size:13px">Выполнение запроса...</div>';

      try {
        const res = await fetch('/api/sql/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql, query: sql })
        });
        const data = await res.json();
        if (!res.ok || !data.success || data.error) {
          resWrap.innerHTML = `<div style="background:#FFF5F5;color:#C53030;padding:12px;border-radius:8px;border:1px solid #FEB2B2;font-size:13px"><b class="mono">Ошибка:</b> ${esc(data.error || 'SQL Error')}</div>`;
          return;
        }

        if (data.type === 'write') {
          resWrap.innerHTML = `
            <div style="background:#F0FFF4;color:#22543D;padding:12px 14px;border-radius:8px;border:1px solid #9AE6B4;font-size:13px">
              <b>✓ Запрос успешно выполнен.</b> Затронуто строк: <b class="mono">${data.rowsAffected ?? 0}</b>${data.lastInsertId ? ` · ID новой записи: <b class="mono">${data.lastInsertId}</b>` : ''}
            </div>
          `;
          await refreshAll(S);
          return;
        }

        // Render result table for SELECT/PRAGMA
        const cols = data.columns || [];
        const rows = data.rows || [];
        const affected = data.rowsAffected != null ? ` · Затронуто строк: <b>${data.rowsAffected}</b>` : '';

        resWrap.innerHTML = `
          <div style="font-size:12px;color:var(--mut);margin-bottom:8px">Найдено строк: <b class="mono" style="color:var(--ink)">${rows.length}</b>${affected}</div>
          <div style="max-height:400px;overflow:auto;border:1px solid var(--line);border-radius:8px">
            <table class="tbl" style="margin:0">
              <thead>
                <tr>${cols.map(c => `<th style="padding:6px 10px;font-family:'JetBrains Mono',monospace;font-size:12px">${esc(c)}</th>`).join('')}</tr>
              </thead>
              <tbody>
                ${rows.map(r => `
                  <tr>${cols.map(c => {
                    const v = r[c];
                    const s = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
                    return `<td class="mono" style="padding:6px 10px;font-size:12px;white-space:nowrap">${esc(s)}</td>`;
                  }).join('')}</tr>
                `).join('') || `<tr><td colspan="${cols.length || 1}" style="text-align:center;padding:16px;color:var(--mut)">Нет строк</td></tr>`}
              </tbody>
            </table>
          </div>
        `;

        await refreshAll(S);
      } catch (e) {
        resWrap.innerHTML = `<div style="background:#FFF5F5;color:#C53030;padding:12px;border-radius:8px;border:1px solid #FEB2B2;font-size:13px">${esc(e.message)}</div>`;
      }
    };

    if (btnRun) btnRun.onclick = executeSql;
    if (tx) {
      tx.onkeydown = e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          executeSql();
        }
      };
    }

    mount.querySelectorAll('[data-sql-tpl]').forEach(b => {
      b.onclick = () => {
        tx.value = b.dataset.sqlTpl;
        executeSql();
      };
    });
  }
}

/**
 * Open Record Editor Modal for direct DB row editing/creation
 */
function openRecordEditor(S, tbl, recordId, callbacks, onComplete) {
  const isNew = recordId == null;
  const existing = isNew ? {} : (S[tbl] || []).find(r => r.id === recordId || r.key === recordId) || {};
  const jsonCols = JSON_FIELDS[tbl] || [];

  // Determine field keys
  let keys = Object.keys(existing);
  if (!keys.length && (S[tbl] || []).length) {
    keys = Object.keys(S[tbl][0]);
  }
  if (!keys.length) {
    keys = ['name', 'desc', 'note'];
  }

  // Filter out auto increment ID on creation
  const formKeys = isNew ? keys.filter(k => k !== 'id') : keys;

  const formFieldsHtml = formKeys.map(k => {
    const val = existing[k];
    const isJson = jsonCols.includes(k);
    const isId = k === 'id';
    const strVal = isJson
      ? (typeof val === 'object' ? JSON.stringify(val, null, 2) : (val || '[]'))
      : (val ?? '');

    if (isJson) {
      return `
        <div class="fg full">
          <label class="fl">
            <span class="mono">${esc(k)}</span> <span class="chip mono" style="font-size:10px;background:#FAF5FF;color:#6B46C1">JSON</span>
          </label>
          <textarea class="ipt mono" id="inp_${k}" rows="4" style="width:100%;font-size:12px;line-height:1.4;background:#1E293B;color:#F8FAFC;padding:8px">${esc(strVal)}</textarea>
        </div>
      `;
    }

    return `
      <div class="fg" style="grid-column:span 6">
        <label class="fl"><span class="mono">${esc(k)}</span>${isId ? ' (Primary Key)' : ''}</label>
        <input type="text" class="ipt" id="inp_${k}" value="${esc(strVal)}" ${isId ? 'disabled style="background:#EDF2F7"' : ''}>
      </div>
    `;
  }).join('');

  modal({
    title: isNew ? `Создание записи: ${tbl}` : `Редактирование: ${tbl} #${recordId}`,
    sub: TABLE_DESCRIPTIONS[tbl] || 'Таблица базы данных SQLite',
    wide: true,
    body: `
      <form id="frmRecordEditor" class="fgrid" style="display:grid;grid-template-columns:repeat(12,1fr);gap:12px">
        ${formFieldsHtml}
      </form>
    `,
    foot: `
      <button class="btn" data-x>Отмена</button>
      <button class="btn pri" id="btnSaveRecord">Сохранить запись</button>
    `,
    mount(box) {
      box.el.querySelector('[data-x]').onclick = () => box.close();

      box.el.querySelector('#btnSaveRecord').onclick = async () => {
        const item = { ...existing };
        for (const k of formKeys) {
          if (k === 'id' && !isNew) continue;
          const el = box.el.querySelector('#inp_' + k);
          if (!el) continue;
          const raw = el.value.trim();
          if (jsonCols.includes(k)) {
            try {
              item[k] = raw ? JSON.parse(raw) : (k === 'stageProgress' || k === 'wipLimits' ? {} : []);
            } catch (err) {
              toast(`Поле ${k} содержит некорректный JSON: ${err.message}`, 'err');
              return;
            }
          } else {
            if (raw === '') item[k] = null;
            else if (!isNaN(raw) && raw !== '' && !['num', 'name', 'desc', 'note', 'contacts', 'extNum', 'extLink', 'role', 'position', 'color', 'key', 'value', 'ip', 'userAgent', 'target'].includes(k)) {
              item[k] = +raw;
            } else {
              item[k] = raw;
            }
          }
        }

        if (item.createdAt === undefined && !isNew) item.createdAt = nowIso();
        if (item.updatedAt !== undefined) item.updatedAt = nowIso();

        try {
          if (tbl === 'meta') {
            await fetch(`/api/meta/${item.key}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(item.value)
            });
          } else if (isNew) {
            await db[tbl].add(item);
          } else {
            await db[tbl].put(item);
          }

          await refreshAll(S);
          if (callbacks.autoSave) await afterChange(S, callbacks.autoSave);
          toast(isNew ? 'Запись создана' : 'Запись обновлена', 'ok');
          box.close();
          if (onComplete) onComplete();
        } catch (e) {
          toast('Ошибка сохранения: ' + e.message, 'err');
        }
      };
    }
  });
}

/**
 * Open pure JSON viewer for any row
 */
function openJsonViewer(S, tbl, recordId) {
  const item = (S[tbl] || []).find(r => r.id === recordId || r.key === recordId);
  if (!item) return;

  modal({
    title: `JSON объекта: ${tbl} #${recordId}`,
    sub: 'ТЕХНИЧЕСКИЙ ПРОСМОТР',
    wide: true,
    body: `
      <pre class="mono" style="background:#1E293B;color:#F8FAFC;padding:14px;border-radius:8px;font-size:12.5px;line-height:1.45;max-height:480px;overflow:auto;margin:0">${esc(JSON.stringify(item, null, 2))}</pre>
    `,
    foot: '<button class="btn pri" data-x>Закрыть</button>',
    mount(box) {
      box.el.querySelector('[data-x]').onclick = () => box.close();
    }
  });
}

/**
 * Pure raw database table browser with in-header filters, sorting, search, selection, and direct CRUD
 */
export function renderRawDbTable(S, tbl, mount, callbacks = {}) {
  const st = getRawTableState(tbl);
  const selected = st.selected;
  let rows = S[tbl] || [];

  // Determine all raw columns
  let cols = RAW_TABLE_COLUMNS[tbl] ? [...RAW_TABLE_COLUMNS[tbl]] : [];
  if (!cols.length && rows.length) {
    cols = Object.keys(rows[0]);
  }
  // If rows have extra keys not in predefined list, append them
  if (rows.length) {
    const knownSet = new Set(cols);
    Object.keys(rows[0]).forEach(k => {
      if (!knownSet.has(k)) cols.push(k);
    });
  }

  // 1. Search filtering
  if (st.search) {
    const q = st.search.toLowerCase();
    rows = rows.filter(r => {
      return cols.some(k => {
        const val = r[k];
        const str = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val ?? '');
        return str.toLowerCase().includes(q);
      });
    });
  }

  // 2. Column filters
  Object.entries(st.filters).forEach(([colKey, allowedSet]) => {
    if (allowedSet && allowedSet.size > 0) {
      rows = rows.filter(r => {
        const val = r[colKey];
        const strVal = val == null ? 'NULL' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
        return allowedSet.has(strVal);
      });
    }
  });

  // 3. Sorting
  if (st.sort && st.sort.k) {
    const sk = st.sort.k;
    const sd = st.sort.d;
    rows = [...rows].sort((a, b) => {
      let va = a[sk];
      let vb = b[sk];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sd;
      const sa = typeof va === 'object' ? JSON.stringify(va) : String(va);
      const sb = typeof vb === 'object' ? JSON.stringify(vb) : String(vb);
      return sa.localeCompare(sb, undefined, { numeric: true, sensitivity: 'base' }) * sd;
    });
  }

  const ROW_CAP = 100;
  const isLimited = !st.showAll && rows.length > ROW_CAP;
  const shownRows = isLimited ? rows.slice(0, ROW_CAP) : rows;
  const totalCount = (S[tbl] || []).length;
  const filterCount = Object.keys(st.filters).length + (st.search ? 1 : 0);
  const allShownSelected = shownRows.length > 0 && shownRows.every(r => selected.has(r.id != null ? r.id : r.key));

  // Bulk bar
  const bulkBarHtml = selected.size > 0 ? `
    <div class="bulk-bar" style="display:flex;align-items:center;gap:12px;background:#1E293B;color:#fff;padding:8px 14px;border-radius:8px;margin-bottom:8px;font-size:13px">
      <span>Выбрано: <b>${selected.size}</b></span>
      <div style="flex:1"></div>
      <button class="btn sm dgr" id="btnRawBulkDelete" style="background:#E53E3E;border-color:#E53E3E;color:#fff;font-weight:700">Удалить выбранные</button>
      <button class="btn sm" id="btnRawBulkClear" style="background:rgba(255,255,255,0.2);color:#fff;border-color:rgba(255,255,255,0.3)">Снять выбор</button>
    </div>
  ` : '';

  // Render Table Head
  const theadHtml = cols.map(k => {
    const isSorted = st.sort && st.sort.k === k;
    const arrow = isSorted ? (st.sort.d > 0 ? '▲' : '▼') : '';
    const hasFilter = st.filters[k] && st.filters[k].size > 0;

    return `
      <th class="th" data-raw-col="${k}" style="padding:6px 10px;white-space:nowrap;user-select:none;font-family:'JetBrains Mono',monospace;font-size:12px;background:#F8FAFC;border-bottom:2px solid var(--line);border-right:1px solid var(--line2)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <span class="raw-th-title" data-raw-sort="${k}" style="cursor:pointer;font-weight:700;color:var(--ink);display:flex;align-items:center;gap:4px">
            ${esc(k)}
            ${arrow ? `<span style="font-size:10px;color:var(--acc)">${arrow}</span>` : ''}
          </span>
          <button class="fbtn ${hasFilter ? 'on' : ''}" data-raw-filter="${k}" title="Фильтр по полю ${k}" style="padding:2px 4px;border:none;border-radius:4px;cursor:pointer;background:${hasFilter ? '#EBF8FA' : 'transparent'};color:${hasFilter ? 'var(--acc)' : 'var(--mut2)'}">
            ${FUNNEL_ICON}
          </button>
        </div>
      </th>
    `;
  }).join('');

  // Render Table Body
  const tbodyHtml = shownRows.map(r => {
    const rowId = r.id != null ? r.id : r.key;
    const isChecked = selected.has(rowId);

    const cells = cols.map(k => {
      const val = r[k];
      let displayHtml = '';
      if (val == null) {
        displayHtml = '<span style="color:var(--mut2)">NULL</span>';
      } else if (typeof val === 'object') {
        const jsonStr = JSON.stringify(val);
        const short = jsonStr.length > 45 ? jsonStr.slice(0, 45) + '…' : jsonStr;
        displayHtml = `<span class="mono" style="color:#553C9A;cursor:pointer;font-size:11.5px" title="${esc(jsonStr)}" data-raw-json="${esc(jsonStr)}">${esc(short)}</span>`;
      } else if (typeof val === 'boolean') {
        displayHtml = `<span class="mono" style="color:${val ? '#2B6CB0' : 'var(--mut)'}">${val ? '1' : '0'}</span>`;
      } else if (k === 'id') {
        displayHtml = `<span class="mono" style="font-weight:700;color:var(--ink)">${val}</span>`;
      } else {
        const strVal = String(val);
        const short = strVal.length > 60 ? strVal.slice(0, 60) + '…' : strVal;
        displayHtml = `<span class="mono" style="font-size:12px;color:var(--ink)" title="${esc(strVal)}">${esc(short)}</span>`;
      }

      return `<td style="padding:6px 10px;white-space:nowrap;border-bottom:1px solid var(--line2);border-right:1px solid var(--line2)">${displayHtml}</td>`;
    }).join('');

    return `
      <tr class="${isChecked ? 'row-selected' : ''}" style="background:${isChecked ? '#F0F9FF' : '#fff'};transition:background 0.1s">
        <td style="width:36px;text-align:center;padding:6px;border-bottom:1px solid var(--line2)">
          <input type="checkbox" class="raw-row-chk" data-row-id="${rowId}" ${isChecked ? 'checked' : ''}>
        </td>
        ${cells}
        <td style="width:130px;padding:4px 8px;text-align:right;border-bottom:1px solid var(--line2);white-space:nowrap">
          <div style="display:flex;gap:4px;justify-content:flex-end">
            <button class="btn sm" data-raw-act-json="${rowId}" title="JSON" style="padding:2px 6px;font-size:11px">JSON</button>
            <button class="btn sm" data-raw-act-edit="${rowId}" title="Редактировать" style="padding:2px 6px;font-size:11px">Ред.</button>
            <button class="btn sm dgr" data-raw-act-del="${rowId}" title="Удалить" style="padding:2px 6px;font-size:11px">Удалить</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const filterBadgeHtml = filterCount > 0 ? `
    <button class="btn sm" id="btnRawResetFilters" title="Сбросить все применённые фильтры и поиск" style="display:inline-flex;align-items:center;gap:6px;background:#FFF5F5;border-color:#FEB2B2;color:#C53030;font-weight:700;padding:3px 10px;border-radius:6px;cursor:pointer;margin-left:6px">
      <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px"><path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/></svg>
      Применено фильтров: ${filterCount}
      <span style="font-weight:800;margin-left:2px;font-size:12px">✕ Сбросить</span>
    </button>
  ` : '';

  mount.innerHTML = `
    ${bulkBarHtml}
    <div class="panel" style="background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden;box-shadow:var(--sh)">
      <!-- Toolbar -->
      <div class="toolbar" style="padding:8px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:200px">
          <input type="text" id="rawTableSearch" class="ipt" placeholder="Поиск по колонкам ${tbl}..." value="${esc(st.search)}" style="font-size:12.5px;padding:4px 8px;max-width:280px">
          ${st.search ? '<button class="btn sm" id="btnRawClearSearch">✕</button>' : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:12.5px;color:var(--mut)">
            Показано <b class="mono" style="color:var(--ink)">${shownRows.length}</b> из <b class="mono" style="color:var(--ink)">${rows.length}</b>
          </span>
          ${filterBadgeHtml}
        </div>
      </div>

      <!-- Raw Table Container -->
      <div class="tbl-wrap">
        <table class="tbl" style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="width:36px;text-align:center;padding:6px;background:#F8FAFC;border-bottom:2px solid var(--line)">
                <input type="checkbox" id="rawChkSelectAll" ${allShownSelected ? 'checked' : ''} title="Выбрать все">
              </th>
              ${theadHtml}
              <th style="width:130px;background:#F8FAFC;border-bottom:2px solid var(--line)"></th>
            </tr>
          </thead>
          <tbody>
            ${tbodyHtml || `<tr><td colspan="${cols.length + 2}" style="padding:32px;text-align:center;color:var(--mut2)">Нет строк в таблице ${tbl}</td></tr>`}
          </tbody>
        </table>
      </div>

      ${isLimited ? `
        <div style="padding:8px 12px;border-top:1px solid var(--line);background:#FAFAFA">
          <button class="btn sm" id="btnRawShowAll">Показать все (${rows.length})</button>
        </div>
      ` : ''}
    </div>
  `;

  // Re-render helper
  const reRenderRaw = () => renderRawDbTable(S, tbl, mount, callbacks);

  // Search bind
  const searchInp = mount.querySelector('#rawTableSearch');
  if (searchInp) {
    let searchTimer = null;
    searchInp.oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        st.search = searchInp.value.trim();
        reRenderRaw();
      }, 200);
    };
  }
  const btnClrSearch = mount.querySelector('#btnRawClearSearch');
  if (btnClrSearch) {
    btnClrSearch.onclick = () => {
      st.search = '';
      reRenderRaw();
    };
  }

  // Reset filters
  const btnResetF = mount.querySelector('#btnRawResetFilters');
  if (btnResetF) {
    btnResetF.onclick = () => {
      st.filters = {};
      st.search = '';
      reRenderRaw();
    };
  }

  // Show all
  const btnShowAll = mount.querySelector('#btnRawShowAll');
  if (btnShowAll) {
    btnShowAll.onclick = () => {
      st.showAll = true;
      reRenderRaw();
    };
  }

  // Sort click on header
  mount.querySelectorAll('.raw-th-title').forEach(el => {
    el.onclick = () => {
      const k = el.dataset.rawSort;
      if (st.sort.k === k) {
        st.sort.d = st.sort.d === 1 ? -1 : 1;
      } else {
        st.sort.k = k;
        st.sort.d = 1;
      }
      reRenderRaw();
    };
  });

  // Filter click on header
  mount.querySelectorAll('[data-raw-filter]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const colKey = btn.dataset.rawFilter;
      openRawColFilter(S, tbl, colKey, btn, reRenderRaw);
    };
  });

  // Select all checkbox
  const chkAll = mount.querySelector('#rawChkSelectAll');
  if (chkAll) {
    chkAll.onchange = () => {
      if (chkAll.checked) {
        shownRows.forEach(r => selected.add(r.id != null ? r.id : r.key));
      } else {
        shownRows.forEach(r => selected.delete(r.id != null ? r.id : r.key));
      }
      reRenderRaw();
    };
  }

  // Row selection checkbox
  mount.querySelectorAll('.raw-row-chk').forEach(chk => {
    chk.onchange = (e) => {
      e.stopPropagation();
      const id = isNaN(+chk.dataset.rowId) ? chk.dataset.rowId : +chk.dataset.rowId;
      if (chk.checked) selected.add(id);
      else selected.delete(id);
      reRenderRaw();
    };
  });

  // Bulk actions
  const btnBulkDel = mount.querySelector('#btnRawBulkDelete');
  if (btnBulkDel) {
    btnBulkDel.onclick = () => {
      if (callbacks.onBulkDelete) callbacks.onBulkDelete(tbl, Array.from(selected));
    };
  }
  const btnBulkClr = mount.querySelector('#btnRawBulkClear');
  if (btnBulkClr) {
    btnBulkClr.onclick = () => {
      selected.clear();
      reRenderRaw();
    };
  }

  // Row actions
  mount.querySelectorAll('[data-raw-act-json]').forEach(btn => {
    btn.onclick = () => {
      const id = isNaN(+btn.dataset.rawActJson) ? btn.dataset.rawActJson : +btn.dataset.rawActJson;
      if (callbacks.onView) callbacks.onView(tbl, id);
    };
  });
  mount.querySelectorAll('[data-raw-act-edit]').forEach(btn => {
    btn.onclick = () => {
      const id = isNaN(+btn.dataset.rawActEdit) ? btn.dataset.rawActEdit : +btn.dataset.rawActEdit;
      if (callbacks.onEdit) callbacks.onEdit(tbl, id);
    };
  });
  mount.querySelectorAll('[data-raw-act-del]').forEach(btn => {
    btn.onclick = () => {
      const id = isNaN(+btn.dataset.rawActDel) ? btn.dataset.rawActDel : +btn.dataset.rawActDel;
      if (callbacks.onDelete) callbacks.onDelete(tbl, id);
    };
  });

  // JSON popup on click
  mount.querySelectorAll('[data-raw-json]').forEach(el => {
    el.onclick = () => {
      modal({
        title: 'JSON значение',
        wide: true,
        body: `<pre class="mono" style="background:#1E293B;color:#F8FAFC;padding:14px;border-radius:8px;font-size:12.5px;max-height:450px;overflow:auto;margin:0">${esc(el.dataset.rawJson)}</pre>`,
        foot: '<button class="btn pri" data-x>Закрыть</button>',
        mount(box) { box.el.querySelector('[data-x]').onclick = () => box.close(); }
      });
    };
  });
}

/**
 * Filter popover for raw DB column
 */
function openRawColFilter(S, tbl, colKey, anchorEl, onApply) {
  const st = getRawTableState(tbl);
  const rows = S[tbl] || [];

  // Collect distinct values for this column
  const valCount = new Map();
  rows.forEach(r => {
    const val = r[colKey];
    const strVal = val == null ? 'NULL' : (typeof val === 'object' ? JSON.stringify(val) : String(val));
    valCount.set(strVal, (valCount.get(strVal) || 0) + 1);
  });

  const distinctVals = Array.from(valCount.keys()).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const activeSet = st.filters[colKey] ? new Set(st.filters[colKey]) : null;

  popover({
    anchor: anchorEl,
    title: `Фильтр: ${colKey}`,
    body: `
      <div style="display:flex;flex-direction:column;gap:8px;min-width:220px;max-width:280px">
        <input type="text" id="popColSearch" class="ipt" placeholder="Поиск значений..." style="font-size:12px;padding:3px 6px">
        <div style="display:flex;gap:6px">
          <button class="btn sm" id="btnPopSelectAll" style="font-size:11px;padding:2px 6px">Выбрать все</button>
          <button class="btn sm" id="btnPopClearAll" style="font-size:11px;padding:2px 6px">Снять все</button>
        </div>
        <div id="popValList" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;border:1px solid var(--line);border-radius:6px;padding:4px">
          ${distinctVals.map(val => {
            const isChecked = activeSet ? activeSet.has(val) : true;
            const count = valCount.get(val);
            return `
              <label class="raw-pop-item" data-val="${esc(val)}" style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;font-size:12px;cursor:pointer">
                <input type="checkbox" class="raw-pop-chk" value="${esc(val)}" ${isChecked ? 'checked' : ''}>
                <span class="mono" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${val === 'NULL' ? 'var(--mut2)' : 'var(--ink)'}">${esc(val)}</span>
                <span class="mono" style="font-size:10.5px;color:var(--mut)">${count}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `,
    foot: `
      <button class="btn sm" id="btnPopReset">Сброс</button>
      <button class="btn sm pri" id="btnPopApply">Применить</button>
    `,
    mount(pBox) {
      const search = pBox.el.querySelector('#popColSearch');
      if (search) {
        search.oninput = () => {
          const q = search.value.toLowerCase();
          pBox.el.querySelectorAll('.raw-pop-item').forEach(item => {
            const v = (item.dataset.val || '').toLowerCase();
            item.style.display = v.includes(q) ? 'flex' : 'none';
          });
        };
      }

      pBox.el.querySelector('#btnPopSelectAll').onclick = () => {
        pBox.el.querySelectorAll('.raw-pop-chk').forEach(c => c.checked = true);
      };
      pBox.el.querySelector('#btnPopClearAll').onclick = () => {
        pBox.el.querySelectorAll('.raw-pop-chk').forEach(c => c.checked = false);
      };

      pBox.el.querySelector('#btnPopReset').onclick = () => {
        delete st.filters[colKey];
        pBox.close();
        onApply();
      };

      pBox.el.querySelector('#btnPopApply').onclick = () => {
        const selectedVals = new Set();
        let totalChks = 0;
        pBox.el.querySelectorAll('.raw-pop-chk').forEach(c => {
          totalChks++;
          if (c.checked) selectedVals.add(c.value);
        });

        if (selectedVals.size === 0 || selectedVals.size === totalChks) {
          delete st.filters[colKey];
        } else {
          st.filters[colKey] = selectedVals;
        }
        pBox.close();
        onApply();
      };
    }
  });
}

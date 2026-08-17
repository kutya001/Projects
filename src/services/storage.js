// src/services/storage.js
import { db, refreshAll } from '../core/db.js';
import { getSnapshot, importSnapshot } from '../core/api.js';
import { savePrefs } from '../core/prefs.js';
import { nowIso, fmtDT, stamp } from '../utils/date.js';
import { download, debounce, $, esc } from '../utils/dom.js';
import { updateBackupBeacon, afterChange, setDbBeacon } from '../utils/logger.js';
import { toast } from '../ui/toast.js';
import { modal, confirmBox } from '../ui/modal.js';

export const ENTITY_LABELS = {
  projects: 'Проекты',
  tasks: 'Задачи',
  changes: 'Изменения',
  employees: 'Сотрудники / Разработчики',
  customers: 'Заказчики',
  priorities: 'Приоритеты',
  taskStatuses: 'Статусы задач/изменений',
  projectStatuses: 'Статусы проектов',
  stages: 'Этапы проектов',
  stageHistory: 'История изменения этапов',
  kanbanBoards: 'Канбан-доски',
  meta: 'Системные настройки (Meta)'
};

/**
 * Export entity import template JSON with accompanying reference guides
 */
export function exportEntityTemplate(S, ent) {
  let targetData = [];
  let referenceGuides = {};
  let entRu = 'Записи';

  if (ent === 'projects') {
    entRu = 'Проектов';
    targetData = (S.projects || []).map(p => ({
      id: p.id,
      num: p.num || '',
      name: p.name || '',
      desc: p.desc || '',
      note: p.note || '',
      statusId: p.statusId || null,
      priorityId: p.priorityId || null,
      stageId: p.stageId || null,
      customerId: p.customerId || null,
      devId: p.devId || null,
      agentId: p.agentId || null,
      start: p.start || '',
      end: p.end || '',
      stageProgress: p.stageProgress ? { ...p.stageProgress } : {},
      checklists: p.checklists || [],
      notes: p.notes || [],
      agents: p.agents || [],
      devs: p.devs || []
    }));

    referenceGuides = {
      projectStatuses: (S.projectStatuses || []).map(s => ({ id: s.id, name: s.name, color: s.color })),
      priorities: (S.priorities || []).map(p => ({ id: p.id, name: p.name, color: p.color, weight: p.weight })),
      stages: (S.stages || []).map(st => ({ id: st.id, name: st.name, color: st.color, order: st.order, description: `ID этапа для stageProgress (формат: {"${st.id}": 100})` })),
      customers: (S.customers || []).map(c => ({ id: c.id, name: c.name, contacts: c.contacts })),
      employees: (S.employees || []).map(e => ({ id: e.id, name: e.name, role: e.role, position: e.position, color: e.color }))
    };
  } else if (ent === 'tasks') {
    entRu = 'Задач';
    targetData = (S.tasks || []).map(t => ({
      id: t.id,
      num: t.num || '',
      projectId: t.projectId || null,
      name: t.name || '',
      desc: t.desc || '',
      note: t.note || '',
      statusId: t.statusId || null,
      priorityId: t.priorityId || null,
      customerId: t.customerId || null,
      devId: t.devId || null,
      agentId: t.agentId || null,
      start: t.start || '',
      end: t.end || '',
      extNum: t.extNum || '',
      extLink: t.extLink || '',
      checklists: t.checklists || [],
      notes: t.notes || [],
      agents: t.agents || [],
      devs: t.devs || []
    }));

    referenceGuides = {
      projects: (S.projects || []).map(p => ({ id: p.id, num: p.num, name: p.name })),
      taskStatuses: (S.taskStatuses || []).map(s => ({ id: s.id, name: s.name, color: s.color })),
      priorities: (S.priorities || []).map(p => ({ id: p.id, name: p.name, color: p.color, weight: p.weight })),
      customers: (S.customers || []).map(c => ({ id: c.id, name: c.name, contacts: c.contacts })),
      employees: (S.employees || []).map(e => ({ id: e.id, name: e.name, role: e.role, position: e.position, color: e.color }))
    };
  } else if (ent === 'changes') {
    entRu = 'Изменений';
    targetData = (S.changes || []).map(c => ({
      id: c.id,
      num: c.num || '',
      taskId: c.taskId || null,
      name: c.name || '',
      desc: c.desc || '',
      note: c.note || '',
      statusId: c.statusId || null,
      priorityId: c.priorityId || null,
      customerId: c.customerId || null,
      devId: c.devId || null,
      agentId: c.agentId || null,
      start: c.start || '',
      end: c.end || '',
      extNum: c.extNum || '',
      extLink: c.extLink || '',
      checklists: c.checklists || [],
      notes: c.notes || [],
      agents: c.agents || [],
      devs: c.devs || []
    }));

    referenceGuides = {
      tasks: (S.tasks || []).map(t => ({ id: t.id, num: t.num, name: t.name, projectId: t.projectId })),
      taskStatuses: (S.taskStatuses || []).map(s => ({ id: s.id, name: s.name, color: s.color })),
      priorities: (S.priorities || []).map(p => ({ id: p.id, name: p.name, color: p.color, weight: p.weight })),
      customers: (S.customers || []).map(c => ({ id: c.id, name: c.name, contacts: c.contacts })),
      employees: (S.employees || []).map(e => ({ id: e.id, name: e.name, role: e.role, position: e.position, color: e.color }))
    };
  }

  const exportObj = {
    template: ent,
    version: 1,
    app: 'ProjectsSPA',
    exportDate: nowIso(),
    description: `Шаблон импорта ${entRu} со справочниками для сопоставления ID`,
    notice: 'При загрузке этого шаблона импортируются исключительно записи целевого раздела. Справочники ниже служат ориентиром и не перезаписывают БД.',
    [ent]: targetData,
    referenceGuides
  };

  const fileName = `Template_${ent.charAt(0).toUpperCase() + ent.slice(1)}_${stamp()}.json`;
  download(fileName, JSON.stringify(exportObj, null, 2));
  toast(`Шаблон для импорта ${entRu} успешно выгружен`, 'ok');
}

/**
 * Open selective export modal to allow choosing exactly what entities to download
 */
export async function openSelectiveExportModal(S) {
  const body = `
    <div style="font-size:13px;color:var(--mut);margin-bottom:12px;line-height:1.5">
      Выберите разделы и справочники для выгрузки в файл JSON:
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0 10px;border-bottom:1px solid var(--line2);margin-bottom:10px">
      <button class="btn sm" id="btnSelectAllExport">Выбрать все</button>
      <button class="btn sm" id="btnDeselectAllExport">Снять выбор</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:10px;max-height:360px;overflow-y:auto;padding:4px">
      ${Object.entries(ENTITY_LABELS).map(([key, label]) => {
        const count = Array.isArray(S[key === 'stageHistory' ? 'history' : key])
          ? S[key === 'stageHistory' ? 'history' : key].length
          : (key === 'meta' ? '—' : 0);
        return `
          <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#F8F9F4;border:1px solid var(--line);border-radius:8px;cursor:pointer;font-size:12.5px">
            <input type="checkbox" data-exp-key="${key}" checked style="accent-color:var(--acc);width:16px;height:16px">
            <div style="flex:1">
              <b>${esc(label)}</b>
              <span class="mono" style="font-size:11px;color:var(--mut);display:block">Записей: ${count}</span>
            </div>
          </label>`;
      }).join('')}
    </div>
  `;

  modal({
    title: 'Выборочный экспорт данных (JSON)',
    sub: 'РЕЗЕРВНОЕ КОПИРОВАНИЕ',
    wide: true,
    body,
    foot: `<button class="btn" data-x>Отмена</button><button class="btn pri" id="btnConfirmExport">💾 Скачать JSON</button>`,
    mount(box) {
      box.el.querySelector('[data-x]').onclick = () => box.close();

      const btnAll = box.el.querySelector('#btnSelectAllExport');
      if (btnAll) {
        btnAll.onclick = () => {
          box.el.querySelectorAll('input[data-exp-key]').forEach(i => i.checked = true);
        };
      }

      const btnNone = box.el.querySelector('#btnDeselectAllExport');
      if (btnNone) {
        btnNone.onclick = () => {
          box.el.querySelectorAll('input[data-exp-key]').forEach(i => i.checked = false);
        };
      }

      const btnConfirm = box.el.querySelector('#btnConfirmExport');
      if (btnConfirm) {
        btnConfirm.onclick = async () => {
          const selectedKeys = [...box.el.querySelectorAll('input[data-exp-key]:checked')].map(i => i.dataset.expKey);
          if (!selectedKeys.length) {
            toast('Выберите хотя бы один раздел для экспорта', 'err');
            return;
          }

          try {
            const fullSnapshot = await getSnapshot();
            const filteredData = {};

            selectedKeys.forEach(k => {
              if (fullSnapshot && fullSnapshot.data && fullSnapshot.data[k] !== undefined) {
                filteredData[k] = fullSnapshot.data[k];
              } else if (k === 'stageHistory' && fullSnapshot.data.stageHistory) {
                filteredData.stageHistory = fullSnapshot.data.stageHistory;
              } else if (S[k === 'stageHistory' ? 'history' : k]) {
                filteredData[k] = S[k === 'stageHistory' ? 'history' : k];
              }
            });

            const exportObj = {
              version: 1,
              app: 'ProjectsSPA',
              exportDate: nowIso(),
              entities: selectedKeys,
              data: filteredData
            };

            download('app_export_' + stamp() + '.json', JSON.stringify(exportObj, null, 2));
            S.lastExport = nowIso();
            await db.meta.put({ key: 'lastExport', value: S.lastExport });
            updateBackupBeacon(S);
            const sbExport = $('#sbExport');
            if (sbExport) sbExport.textContent = fmtDT(S.lastExport);
            toast('Экспорт успешно выполнен', 'ok');
            box.close();
          } catch (e) {
            toast('Ошибка экспорта: ' + e.message, 'err');
          }
        };
      }
    }
  });
}

/**
 * Open interactive preview modal before applying import
 */
export async function openImportPreviewModal(S, file, onComplete) {
  try {
    const txt = await file.text();
    if (!txt.trim()) return toast('Файл пустой', 'err');

    let obj;
    try {
      obj = JSON.parse(txt);
    } catch (e) {
      return toast('Файл поврежден: невалидный JSON', 'err');
    }

    // Check if this file is a dedicated entity template file
    const isTemplateFile = Boolean(obj && (obj.template || obj.referenceGuides));
    const templateEnt = obj?.template || (obj?.projects ? 'projects' : (obj?.tasks ? 'tasks' : (obj?.changes ? 'changes' : null)));

    let rawData = null;
    if (obj && obj.data && typeof obj.data === 'object') {
      rawData = obj.data;
    } else if (obj && typeof obj === 'object') {
      rawData = obj;
    }

    if (!rawData) {
      return toast('Не удалось прочесть структуру файла', 'err');
    }

    // Determine available entities inside file
    let detectedKeys = Object.keys(ENTITY_LABELS).filter(k => Array.isArray(rawData[k]) && rawData[k].length > 0);

    // If template file, focus exclusively on the template entity
    if (isTemplateFile && templateEnt && Array.isArray(rawData[templateEnt])) {
      detectedKeys = [templateEnt];
    }

    if (!detectedKeys.length) {
      return toast('В файле не обнаружено поддерживаемых таблиц с записями', 'err');
    }

    let activeTab = detectedKeys[0];

    const renderPreviewTable = (key) => {
      const list = rawData[key] || [];
      if (!list.length) return `<div style="padding:20px;text-align:center;color:var(--mut2)">Нет записей</div>`;

      const first = list[0] || {};
      const fields = Object.keys(first).slice(0, 7);

      const head = fields.map(f => `<th style="padding:6px 10px;font-size:11.5px;text-align:left;background:#F6F7F2;border-bottom:1px solid var(--line)">${esc(f)}</th>`).join('');
      const rows = list.slice(0, 20).map(r => {
        const cells = fields.map(f => {
          const v = r[f];
          const displayStr = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
          return `<td style="padding:6px 10px;font-size:12px;border-bottom:1px solid var(--line2);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(displayStr)}">${esc(displayStr)}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      return `
        <div style="overflow-x:auto;max-height:240px;border:1px solid var(--line);border-radius:6px">
          <table style="width:100%;border-collapse:collapse">
            <thead><tr>${head}</tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${list.length > 20 ? `<div style="font-size:11px;color:var(--mut);margin-top:6px;text-align:right">Показано 20 из ${list.length} строк</div>` : ''}
      `;
    };

    const buildModalBody = () => `
      ${isTemplateFile ? `
        <div style="background:#EFF6FF;border:1px solid #93C5FD;border-radius:8px;padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;gap:12px">
          <span style="font-size:24px">📄</span>
          <div style="font-size:12.5px;color:#1E40AF;line-height:1.45">
            <b>Обнаружен файл-шаблон импорта: «${esc(ENTITY_LABELS[templateEnt] || templateEnt)}»</b><br>
            Будут загружены только записи раздела <b>${esc(ENTITY_LABELS[templateEnt] || templateEnt)}</b> (${(rawData[templateEnt] || []).length} шт.). Сопутствующие справочники файла предназначены только для сверки и не будут перезаписывать вашу БД.
          </div>
        </div>
      ` : `
        <div style="font-size:13px;color:var(--ink);margin-bottom:12px">
          Файл: <b>${esc(file.name)}</b>. Выберите разделы для загрузки и режим импорта:
        </div>
      `}

      <!-- Entity Selection & Counts -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:8px;margin-bottom:14px">
        ${detectedKeys.map(k => `
          <label style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#F8F9F4;border:1px solid var(--line);border-radius:6px;cursor:pointer;font-size:12px">
            <input type="checkbox" data-imp-key="${k}" checked style="accent-color:var(--acc);width:15px;height:15px">
            <div style="flex:1">
              <b>${esc(ENTITY_LABELS[k] || k)}</b>
              <span class="mono" style="font-size:10.5px;color:var(--acc)">${(rawData[k] || []).length} шт.</span>
            </div>
          </label>
        `).join('')}
      </div>

      <!-- Import Mode Selection -->
      <div style="background:#FFFDF5;border:1px solid #F6E05E;border-radius:8px;padding:10px 12px;margin-bottom:14px">
        <div style="font-weight:700;font-size:12.5px;color:#744210;margin-bottom:6px">⚙️ Режим импорта:</div>
        <div style="display:flex;gap:18px">
          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
            <input type="radio" name="impMode" value="merge" checked>
            <span><b>Дополнить / Добавить новые</b> (сохранить текущие)</span>
          </label>
          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer">
            <input type="radio" name="impMode" value="replace">
            <span><b>Заменить раздел</b> (очистить перед загрузкой)</span>
          </label>
        </div>
      </div>

      <!-- Data Preview Tabs -->
      <div>
        <div class="v-section-title" style="margin-bottom:8px">👀 Предварительный просмотр загружаемых данных:</div>
        <div class="ftabs" id="previewTabs" style="padding:0;margin-bottom:8px">
          ${detectedKeys.map(k => `<button class="${k === activeTab ? 'on' : ''}" data-ptab="${k}">${esc(ENTITY_LABELS[k] || k)} (${(rawData[k] || []).length})</button>`).join('')}
        </div>
        <div id="previewTableMount">
          ${renderPreviewTable(activeTab)}
        </div>
      </div>
    `;

    modal({
      title: isTemplateFile ? `Импорт шаблона ${ENTITY_LABELS[templateEnt] || templateEnt}` : 'Предварительный просмотр данных перед импортом',
      sub: isTemplateFile ? 'ИМПОРТ ИЗ ШАБЛОНА' : 'ИМПОРТ JSON',
      wide: true,
      body: buildModalBody(),
      foot: `<button class="btn" data-x>Отмена</button><button class="btn pri" id="btnExecuteImport">📥 Импортировать данные</button>`,
      mount(box) {
        box.el.querySelector('[data-x]').onclick = () => box.close();

        // Tab switching
        box.el.querySelectorAll('#previewTabs button').forEach(btn => {
          btn.onclick = () => {
            box.el.querySelectorAll('#previewTabs button').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            activeTab = btn.dataset.ptab;
            const mountEl = box.el.querySelector('#previewTableMount');
            if (mountEl) mountEl.innerHTML = renderPreviewTable(activeTab);
          };
        });

        // Execute import
        const btnExec = box.el.querySelector('#btnExecuteImport');
        if (btnExec) {
          btnExec.onclick = async () => {
            const selectedKeys = [...box.el.querySelectorAll('input[data-imp-key]:checked')].map(i => i.dataset.impKey);
            if (!selectedKeys.length) {
              toast('Выберите хотя бы одну таблицу для импорта', 'err');
              return;
            }

            const mode = box.el.querySelector('input[name="impMode"]:checked')?.value || 'merge';

            try {
              btnExec.disabled = true;
              btnExec.textContent = 'Импортирование...';

              for (const k of selectedKeys) {
                let records = rawData[k] || [];
                const tableKey = k === 'stageHistory' ? 'stageHistory' : k;

                if (tableKey === 'projects') {
                  records.forEach(p => {
                    if (p.stageProgress && typeof p.stageProgress === 'object') {
                      const normProgress = {};
                      Object.entries(p.stageProgress).forEach(([stKey, val]) => {
                        const numVal = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
                        if (!isNaN(+stKey) && (S.stages || []).some(s => s.id === +stKey)) {
                          normProgress[+stKey] = numVal;
                        } else {
                          const matched = (S.stages || []).find(s => s.name.toLowerCase().trim() === String(stKey).toLowerCase().trim());
                          if (matched) {
                            normProgress[matched.id] = numVal;
                          } else {
                            normProgress[stKey] = numVal;
                          }
                        }
                      });
                      p.stageProgress = normProgress;
                    }
                  });
                }

                if (db[tableKey]) {
                  if (mode === 'replace') {
                    await db[tableKey].clear();
                  }
                  if (records.length) {
                    await db[tableKey].bulkAdd(records);
                  }
                }
              }

              if (!isTemplateFile && rawData.prefs && typeof rawData.prefs === 'object') {
                S.prefs = Object.assign(S.prefs || {}, rawData.prefs);
                await savePrefs(S);
              }

              await refreshAll(S);
              await afterChange(S, () => {});
              toast(`Импорт успешно завершен (${selectedKeys.length} таблиц)`, 'ok');
              box.close();
              if (onComplete) onComplete();
            } catch (e) {
              setDbBeacon('error', '🔴 Ошибка базы данных');
              toast('Ошибка импорта: ' + e.message, 'err');
              btnExec.disabled = false;
              btnExec.textContent = '📥 Импортировать данные';
            }
          };
        }
      }
    });

  } catch (e) {
    toast('Ошибка чтения файла: ' + e.message, 'err');
  }
}

export function createScheduleAutoFile(S) {
  return debounce(() => {}, 900);
}

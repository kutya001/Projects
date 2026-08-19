// src/pages/settings.js
import { openSelectiveExportModal, openImportPreviewModal, exportEntityTemplate } from '../services/storage.js';
import { seedDemo, addDemoProjects } from '../services/seed.js';
import { confirmBox } from '../ui/modal.js';
import { db, refreshAll } from '../core/db.js';
import { afterChange, setDbBeacon, updateBackupBeacon } from '../utils/logger.js';
import { toast } from '../ui/toast.js';
import { savePrefs } from '../core/prefs.js';
import { fmtDT } from '../utils/date.js';
import { esc } from '../utils/dom.js';

import { renderUnifiedHeader } from '../ui/unifiedHeader.js';

let auditLogFilters = {
  search: '',
  action: '',
  entity: ''
};

export function renderSettingsPage(S, mount, callbacks = {}) {
  const mods = S.prefs.modules || { projects: true, tasks: false, changes: false };

  const headerHtml = renderUnifiedHeader(S, {
    title: 'Настройки',
    count: null
  });

  mount.innerHTML = `
    ${headerHtml}
    <div class="page-content" style="padding-top:10px">
      <div class="setgrid" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px">

      <!-- Author and Platform Info Card -->
      <div class="setcard" style="border-left: 4px solid #805AD5">
        <h3>О платформе и автор</h3>
        <div style="display:flex;align-items:center;gap:14px;margin-top:10px;padding:12px;background:#F8F9F4;border-radius:8px;border:1px solid var(--line2)">
          <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg, #6B46C1, #0B7285);color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px;flex:none;box-shadow:0 2px 8px rgba(107,70,193,0.3)">
            ОК
          </div>
          <div>
            <div style="font-size:14px;font-weight:800;color:var(--ink)">Омуралиев Кутман</div>
            <div style="font-size:12px;color:var(--mut)">Автор и ведущий разработчик платформы Projects</div>
            <div style="font-size:11.5px;color:var(--acc);margin-top:2px;font-weight:600">Система сквозного планирования и аналитики проектов</div>
          </div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--mut);line-height:1.6;display:flex;flex-direction:column;gap:4px">
          <div>Версия системы: <b style="color:var(--ink)">2.5.0 Enterprise Pro</b></div>
          <div>Архитектура: <b style="color:var(--ink)">SPA · Python asyncio · SQLite WAL</b></div>
        </div>
      </div>

      <!-- Modules Accounting Selection Card -->
      <div class="setcard" style="border-left: 4px solid var(--acc)">
        <h3>Модули системы и учёт</h3>
        <p style="font-size:12.5px;color:var(--mut);margin-bottom:12px;line-height:1.5">
          Выберите разделы, которые необходимы для вашей работы. При отключении модуля он скрывается из меню и форм.
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <label class="cb" style="font-size:13.5px">
            <input type="checkbox" id="chkModProjects" ${mods.projects ? 'checked' : ''}>
            <span><b>Нужен учёт по Проектам?</b></span>
          </label>
          <label class="cb" style="font-size:13.5px;margin-left:28px">
            <input type="checkbox" id="chkModTasks" ${mods.tasks ? 'checked' : ''} ${!mods.projects ? 'disabled' : ''}>
            <span style="${!mods.projects ? 'color:var(--mut2)' : ''}"><b>Нужен учёт по Задачам?</b></span>
          </label>
          <label class="cb" style="font-size:13.5px;margin-left:28px">
            <input type="checkbox" id="chkModChanges" ${mods.changes ? 'checked' : ''} ${!mods.tasks ? 'disabled' : ''}>
            <span style="${!mods.tasks ? 'color:var(--mut2)' : ''}"><b>Нужен учёт по Изменениям?</b></span>
          </label>
        </div>
      </div>

      <!-- Database File Management Card -->
      <div class="setcard" style="border-left: 4px solid #3182CE">
        <h3>База данных SQLite</h3>
        <p style="font-size:12.5px;color:var(--mut);margin-bottom:10px;line-height:1.5">
          Текущий путь к файлу БД и настройка расположения (например, в общей сетевой папке для совместного доступа).
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
          <div>
            <div style="font-size:11px;font-weight:700;color:var(--mut);text-transform:uppercase;margin-bottom:3px">Текущий файл БД:</div>
            <div id="curDbPath" style="font-family:'JetBrains Mono',monospace;font-size:12px;background:var(--bg2, #f5f7fa);padding:6px 10px;border-radius:6px;border:1px solid var(--line);word-break:break-all;user-select:all">
              Загрузка...
            </div>
          </div>
          <div>
            <label class="fl" style="margin-bottom:3px">Сменить путь к файлу БД (.db):</label>
            <div style="display:flex;gap:6px">
              <input type="text" id="inputNewDbPath" placeholder="C:\\SharedFolder\\projects.db" style="font-size:12.5px;flex:1">
              <button class="btn pri sm" id="btnSaveDbPath" style="white-space:nowrap">Сохранить</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Export & Import Card with Backup Beacon -->
      <div class="setcard" style="border-left: 4px solid #38A169">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
          <h3 style="margin-bottom:0">Экспорт и Импорт (JSON)</h3>
          <div class="beacon ${bkClass}" id="bkBeacon" style="font-size:11px;padding:3px 8px"><span class="dot"></span><span class="txt">${bkText}</span></div>
        </div>
        <p style="font-size:12.5px;color:var(--mut);margin-bottom:14px;line-height:1.5">Сохраняйте снимки серверной базы данных SQLite или восстанавливайте данные из файла резервной копии.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
          <button class="btn pri" id="btnExport" style="display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8"/></svg>
            Скачать резервную копию (JSON)
          </button>
          <label class="btn" style="cursor:pointer;display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Импортировать JSON
            <input type="file" id="fileImp" accept=".json" style="display:none">
          </label>
        </div>

        <div style="border-top:1px solid var(--line2);padding-top:12px">
          <div style="font-size:12px;font-weight:700;color:var(--ink);text-transform:uppercase;margin-bottom:6px;letter-spacing:.04em">
            Шаблоны импорта со справочниками:
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn sm" id="btnTplProjects" title="Выгрузить шаблон для импорта проектов" style="display:inline-flex;align-items:center;gap:4px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Шаблон Проектов
            </button>
            <button class="btn sm" id="btnTplTasks" title="Выгрузить шаблон для импорта задач" style="display:inline-flex;align-items:center;gap:4px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Шаблон Задач
            </button>
            <button class="btn sm" id="btnTplChanges" title="Выгрузить шаблон для импорта изменений" style="display:inline-flex;align-items:center;gap:4px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Шаблон Изменений
            </button>
          </div>
        </div>
      </div>

      <!-- Demo Data & Clear Card -->
      <div class="setcard">
        <h3>Демо-данные и Очистка</h3>
        <p style="font-size:12.5px;color:var(--mut);margin-bottom:14px;line-height:1.5">Загружайте тестовые проекты и справочники для проверки работы приложения или полностью очищайте серверную БД.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="btnDemoAll">Загрузить демо (Все)</button>
          <button class="btn" id="btnDemoPrj">+ Демо-проекты</button>
          <button class="btn dgr" id="btnClearAll" style="display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Очистить всё
          </button>
        </div>
      </div>

      <!-- Network Links Card -->
      <div class="setcard">
        <h3>Доступ для пользователей</h3>
        <p style="font-size:12.5px;color:var(--mut);margin-bottom:14px;line-height:1.5">
          Отправьте ссылку коллегам — они откроют приложение в браузере.<br>
          Не закрывайте EXE/консоль на сервере, пока работают пользователи.
        </p>
        <div id="serverLinks" style="display:flex;flex-direction:column;gap:8px">
          <div style="color:var(--mut);font-size:13px">Загрузка...</div>
        </div>
      </div>

      <!-- Server Metadata Card -->
      <div class="setcard">
        <h3>Информация о сервере</h3>
        <div id="serverMeta" style="display:flex;flex-direction:column;gap:6px;font-size:13px;color:var(--ink)">
          <div>Бекенд: <b>Python (aiohttp)</b></div>
          <div>БД: <b>SQLite WAL</b></div>
        </div>
      </div>

      <!-- Form Layouts Card -->
      <div class="setcard">
        <h3>Настройки полей и форм</h3>
        <p style="font-size:12.5px;color:var(--mut);margin-bottom:14px;line-height:1.5">
          Размеры и порядок полей для каждого модуля сохраняются в таблице SQLite <code>formLayouts</code>. Вы можете сбросить все кастомные макеты.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="btnResetAllLayouts">Сбросить все макеты по умолчанию</button>
        </div>
      </div>
    </div>`;

  // Fetch server info and render links
  fetch('/api/server-info')
    .then(r => r.json())
    .then(info => {
      const linksEl = mount.querySelector('#serverLinks');
      const metaEl = mount.querySelector('#serverMeta');
      const curDbPathEl = mount.querySelector('#curDbPath');
      const inputNewDbPath = mount.querySelector('#inputNewDbPath');

      if (curDbPathEl && info.db) {
        curDbPathEl.textContent = info.db;
      }
      if (inputNewDbPath && info.db) {
        inputNewDbPath.value = info.db;
      }

      if (linksEl && info.urls && info.urls.length) {
        linksEl.innerHTML = info.urls.map(url => `
          <div style="display:flex;align-items:center;gap:8px;background:var(--bg2, #f5f7fa);border:1px solid var(--line, #e2e8f0);border-radius:8px;padding:8px 12px">
            <span style="font-family:'JetBrains Mono',monospace;font-size:14px;font-weight:600;flex:1;user-select:all;color:var(--ink)">${url}</span>
            <button class="btn sm pri" data-copy="${url}" style="white-space:nowrap;min-width:max-content">Копировать</button>
          </div>
        `).join('');
        linksEl.querySelectorAll('[data-copy]').forEach(btn => {
          btn.onclick = () => {
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
              const orig = btn.innerHTML;
              btn.innerHTML = 'Скопировано';
              btn.disabled = true;
              setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 1500);
            });
          };
        });
      } else {
        linksEl.innerHTML = '<div style="color:var(--mut);font-size:13px">Сетевые адреса не обнаружены</div>';
      }
      if (metaEl && info.db) {
        metaEl.innerHTML = `
          <div>Бекенд: <b>Python (aiohttp)</b></div>
          <div>БД: <b>SQLite WAL</b></div>
          <div>Файл БД: <span style="font-family:'JetBrains Mono',monospace;font-size:12px;word-break:break-all">${info.db}</span></div>
          <div>Порт: <b>${info.port}</b></div>
        `;
      }
    })
    .catch(() => {
      const linksEl = mount.querySelector('#serverLinks');
      if (linksEl) linksEl.innerHTML = '<div style="color:var(--red, #e53e3e);font-size:13px">Не удалось получить данные сервера</div>';
    });

  // DB Path change handler
  const btnSaveDbPath = mount.querySelector('#btnSaveDbPath');
  if (btnSaveDbPath) {
    btnSaveDbPath.onclick = () => {
      const newPath = (mount.querySelector('#inputNewDbPath').value || '').trim();
      if (!newPath) {
        toast('Укажите путь к файлу базы данных', 'err');
        return;
      }
      confirmBox(`Переключить базу данных на «${newPath}»?`, async () => {
        try {
          const res = await fetch('/api/db-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ db_path: newPath })
          });
          const json = await res.json();
          if (json.success) {
            toast('База данных успешно переключена', 'ok');
            await refreshAll(S);
            renderSettingsPage(S, mount, callbacks);
            if (callbacks.onRefreshPage) callbacks.onRefreshPage();
          } else {
            toast('Ошибка переключения базы данных', 'err');
          }
        } catch (e) {
          toast('Ошибка: ' + e.message, 'err');
        }
      });
    };
  }

  // Reset form layouts handler
  const btnResetAllLayouts = mount.querySelector('#btnResetAllLayouts');
  if (btnResetAllLayouts) {
    btnResetAllLayouts.onclick = () => {
      confirmBox('Сбросить расположение и размеры всех полей во всех формах к исходным значениям?', async () => {
        try {
          await db.formLayouts.clear();
          await refreshAll(S);
          toast('Все макеты форм сброшены по умолчанию', 'ok');
        } catch (e) {
          toast('Ошибка при сбросе макетов: ' + e.message, 'err');
        }
      });
    };
  }

  // Modules accounting toggle handlers
  const chkProjects = mount.querySelector('#chkModProjects');
  const chkTasks = mount.querySelector('#chkModTasks');
  const chkChanges = mount.querySelector('#chkModChanges');

  const updateModuleCheckboxes = async () => {
    S.prefs.modules = S.prefs.modules || {};
    let p = chkProjects.checked;
    let t = chkTasks.checked;
    let c = chkChanges.checked;

    // Rule: At least one must be active
    if (!p && !t && !c) {
      p = true;
      chkProjects.checked = true;
      toast('Хотя бы один модуль должен быть включен', 'err');
    }

    // Rule: Sequential dependence: Projects -> Tasks -> Changes
    if (!p) {
      t = false;
      c = false;
      chkTasks.checked = false;
      chkChanges.checked = false;
    }
    if (!t) {
      c = false;
      chkChanges.checked = false;
    }

    chkTasks.disabled = !p;
    chkChanges.disabled = !t;

    S.prefs.modules = { projects: p, tasks: t, changes: c };
    await savePrefs(S);

    if (callbacks.onModulesChanged) {
      callbacks.onModulesChanged();
    }
    renderSettingsPage(S, mount, callbacks);
  };

  if (chkProjects) chkProjects.onchange = updateModuleCheckboxes;
  if (chkTasks) chkTasks.onchange = updateModuleCheckboxes;
  if (chkChanges) chkChanges.onchange = updateModuleCheckboxes;

  mount.querySelector('#btnExport').onclick = () => openSelectiveExportModal(S);

  const btnTplPrj = mount.querySelector('#btnTplProjects');
  if (btnTplPrj) btnTplPrj.onclick = () => exportEntityTemplate(S, 'projects');

  const btnTplTsk = mount.querySelector('#btnTplTasks');
  if (btnTplTsk) btnTplTsk.onclick = () => exportEntityTemplate(S, 'tasks');

  const btnTplChg = mount.querySelector('#btnTplChanges');
  if (btnTplChg) btnTplChg.onclick = () => exportEntityTemplate(S, 'changes');

  const fileImp = mount.querySelector('#fileImp');
  fileImp.onchange = e => {
    const file = e.target.files[0];
    if (file) {
      openImportPreviewModal(S, file, () => {
        if (callbacks.onRefreshPage) callbacks.onRefreshPage();
        renderSettingsPage(S, mount, callbacks);
      });
      fileImp.value = '';
    }
  };

  mount.querySelector('#btnDemoAll').onclick = () => {
    confirmBox('Заполнить базу полными демо-данными (справочники + проекты)?', async () => {
      await seedDemo(S, true);
      await refreshAll(S);
      await afterChange(S, callbacks.autoSave);
      toast('Демо-данные успешно загружены', 'ok');
      if (callbacks.onRefreshPage) callbacks.onRefreshPage();
      loadAuditLogs();
    });
  };

  mount.querySelector('#btnDemoPrj').onclick = () => {
    confirmBox('Добавить еще комплект тестовых проектов?', async () => {
      await addDemoProjects(S);
      await refreshAll(S);
      await afterChange(S, callbacks.autoSave);
      toast('Демо-проекты добавлены', 'ok');
      if (callbacks.onRefreshPage) callbacks.onRefreshPage();
      loadAuditLogs();
    });
  };

  mount.querySelector('#btnClearAll').onclick = () => {
    confirmBox('Вы абсолютно уверены? Все проекты, задачи, изменения и справочники будут БЕЗВОЗВРАТНО удалены!', async () => {
      for (const t of ['projects', 'tasks', 'changes', 'employees', 'customers', 'priorities', 'taskStatuses', 'projectStatuses', 'stages', 'stageHistory', 'kanbanBoards']) {
        await db[t].clear();
      }
      await refreshAll(S);
      await afterChange(S, callbacks.autoSave);
      toast('База данных полностью очищена', 'ok');
      if (callbacks.onRefreshPage) callbacks.onRefreshPage();
    });
  };
}


// src/app.js
import { state } from './core/state.js';
import { db, refreshAll } from './core/db.js';
import { CLIENT_ID } from './core/api.js';
import { loadPrefs, savePrefs } from './core/prefs.js';
import { router } from './core/router.js';
import { bus } from './core/events.js';
import { $ } from './utils/dom.js';
import { setDbBeacon, updateBackupBeacon, updateCounts, afterChange } from './utils/logger.js';
import { createScheduleAutoFile } from './services/storage.js';
import { openProjectForm } from './pages/forms/ProjectForm.js';
import { openTaskForm } from './pages/forms/TaskForm.js';
import { openChangeForm } from './pages/forms/ChangeForm.js';
import { openDirForm } from './pages/forms/DirForm.js';
import { openViewModal } from './pages/forms/ViewForm.js';
import { renderProjectsPage } from './pages/projects.js';
import { renderTasksPage } from './pages/tasks.js';
import { renderChangesPage } from './pages/changes.js';
import { renderReportsPage } from './pages/reports.js';
import { renderStageHistoryPage } from './pages/stageHistory.js';
import { renderRefsPage } from './pages/refs.js';
import { renderLogsPage } from './pages/logs.js';
import { renderDbInspectorPage } from './pages/dbInspector.js';
import { renderSettingsPage } from './pages/settings.js';
import { confirmBox } from './ui/modal.js';
import { toast } from './ui/toast.js';

export async function initApp() {
  const S = state.raw();
  const autoSave = createScheduleAutoFile(S);

  // 1. Load local UI preferences from localStorage
  loadPrefs(S);

  // 2. Initialize Data from Server
  try {
    const [lsRec, leRec] = await Promise.all([
      db.meta.get('lastSaved'),
      db.meta.get('lastExport')
    ]);

    if (lsRec && lsRec.value) S.lastSaved = lsRec.value;
    if (leRec && leRec.value) S.lastExport = leRec.value;

    await refreshAll(S);
    setDbBeacon('saved', '🟢 SQLite подключена');
  } catch (err) {
    setDbBeacon('error', '🔴 Ошибка подключения к серверу');
    console.error('DB Init Error:', err);
  }

  updateCounts(S);
  updateBackupBeacon(S);

  // Helper to update sidebar visibility according to active modules
  function applyModuleVisibility() {
    const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };
    const navP = document.querySelector('nav .nv[data-page="projects"]');
    const navT = document.querySelector('nav .nv[data-page="tasks"]');
    const navC = document.querySelector('nav .nv[data-page="changes"]');

    if (navP) navP.style.display = mods.projects ? 'flex' : 'none';
    if (navT) navT.style.display = mods.tasks ? 'flex' : 'none';
    if (navC) navC.style.display = mods.changes ? 'flex' : 'none';

    // If current page is disabled, redirect to first active module or refs
    const curRoute = router.getRoute();
    if (curRoute === 'projects' && !mods.projects) {
      if (mods.tasks) router.go('tasks');
      else if (mods.changes) router.go('changes');
      else router.go('refs');
    } else if (curRoute === 'tasks' && !mods.tasks) {
      if (mods.projects) router.go('projects');
      else router.go('refs');
    } else if (curRoute === 'changes' && !mods.changes) {
      if (mods.projects) router.go('projects');
      else if (mods.tasks) router.go('tasks');
      else router.go('refs');
    }
  }

  applyModuleVisibility();

  // 3. Navigation bar & routes
  const pageMount = $('#page');

  const onRecordSaved = async () => {
    await autoSave();
    renderCurrentPage();
  };

  const callbacks = {
    autoSave: onRecordSaved,
    onAdd(ent, preset = {}) {
      if (ent === 'projects') openProjectForm(S, null, onRecordSaved);
      else if (ent === 'tasks') openTaskForm(S, null, preset, onRecordSaved);
      else openChangeForm(S, null, preset, onRecordSaved);
    },
    onView(ent, id) {
      openViewModal(S, ent, id, callbacks);
    },
    onEdit(ent, id) {
      if (ent === 'projects') openProjectForm(S, id, onRecordSaved);
      else if (ent === 'tasks') openTaskForm(S, id, {}, onRecordSaved);
      else openChangeForm(S, id, {}, onRecordSaved);
    },
    onDelete(ent, id) {
      const item = (S[ent] || []).find(x => x.id === id);
      const label = item ? (item.name || item.target || item.num || `ID ${id}`) : `ID ${id}`;
      confirmBox(`Удалить «${label}»?`, async () => {
        try {
          await db[ent].delete(id);
          await refreshAll(S);
          await afterChange(S, onRecordSaved);
          toast('Удалено', 'ok');
          renderCurrentPage();
        } catch (e) {
          setDbBeacon('error', '🔴 Ошибка базы данных');
          toast('Ошибка удаления', 'err');
        }
      });
    },
    onAddDir(type) { openDirForm(S, type, null, onRecordSaved); },
    onEditDir(type, id) { openDirForm(S, type, id, onRecordSaved); },
    onRefreshPage() { renderCurrentPage(); },
    onModulesChanged() {
      applyModuleVisibility();
      renderCurrentPage();
    }
  };

  function renderCurrentPage() {
    const p = router.getRoute();
    S.page = p;

    // Update active nav button
    document.querySelectorAll('nav .nv').forEach(btn => {
      btn.classList.toggle('on', btn.dataset.page === p);
    });

    if (p === 'projects') renderProjectsPage(S, pageMount, callbacks);
    else if (p === 'tasks') renderTasksPage(S, pageMount, callbacks);
    else if (p === 'changes') renderChangesPage(S, pageMount, callbacks);
    else if (p === 'reports') renderReportsPage(S, pageMount, callbacks);
    else if (p === 'stageHistory') renderStageHistoryPage(S, pageMount, callbacks);
    else if (p === 'refs') renderRefsPage(S, pageMount, callbacks);
    else if (p === 'logs') renderLogsPage(S, pageMount, callbacks);
    else if (p === 'dbInspector') renderDbInspectorPage(S, pageMount, callbacks);
    else if (p === 'settings') renderSettingsPage(S, pageMount, callbacks);
    else renderProjectsPage(S, pageMount, callbacks);
  }

  // Sidebar Collapse logic
  const appEl = $('#app');
  const btnToggleSide = $('#btnToggleSide');

  if (S.prefs?.collapsedSide && appEl) {
    appEl.classList.add('collapsed-side');
  }

  if (btnToggleSide && appEl) {
    btnToggleSide.onclick = () => {
      const isCollapsed = appEl.classList.toggle('collapsed-side');
      if (!S.prefs) S.prefs = {};
      S.prefs.collapsedSide = isCollapsed;
      savePrefs(S);
    };
  }

  // Mobile Sidebar Menu logic
  const sideEl = $('#side');
  const overlayEl = $('#sideOverlay');
  const btnMobileMenu = $('#btnMobileMenu');

  function toggleMobileMenu(open) {
    if (!sideEl || !overlayEl) return;
    const isOpened = open !== undefined ? open : !sideEl.classList.contains('open');
    sideEl.classList.toggle('open', isOpened);
    overlayEl.classList.toggle('open', isOpened);
  }

  if (overlayEl) overlayEl.onclick = () => toggleMobileMenu(false);

  // Bind nav bar click listeners
  document.querySelectorAll('nav .nv').forEach(btn => {
    btn.onclick = () => {
      toggleMobileMenu(false);
      router.go(btn.dataset.page);
    };
  });

  // Global delegation for topbar search, clear button, and mobile menu button
  document.addEventListener('click', e => {
    const mobBtn = e.target.closest('#btnMobileMenu');
    if (mobBtn) {
      toggleMobileMenu();
      return;
    }
    const clrBtn = e.target.closest('#btnTopSearchClear');
    if (clrBtn) {
      S.search = '';
      const topSearch = document.querySelector('#topSearch');
      if (topSearch) topSearch.value = '';
      renderCurrentPage();
      return;
    }
  });

  document.addEventListener('input', e => {
    if (e.target && e.target.id === 'topSearch') {
      S.search = e.target.value.trim();
      renderCurrentPage();
    }
  });

  // Router listener
  router.on('route:change', () => {
    // Clear top search input and global search query on module navigation
    const topSearch = $('#topSearch');
    if (topSearch) topSearch.value = '';
    S.search = '';
    renderCurrentPage();
  });

  // Refresh view on state changes
  bus.on('state:change', () => {
    updateCounts(S);
  });

  // Start router
  router.start();

  // --- WebSocket real-time sync ---
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    let reconnectDelay = 1000;

    ws.onopen = () => {
      reconnectDelay = 1000;
      console.log('[WS] Подключено к серверу');
    };

    ws.onmessage = async (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'sync') {
          // If update was initiated by this client, skip redundant reload
          if (msg.source && msg.source === CLIENT_ID) {
            return;
          }

          // Save current scroll position
          const scrollY = window.scrollY;

          await refreshAll(S);
          updateCounts(S);
          updateBackupBeacon(S);

          // Re-render view and restore scroll
          renderCurrentPage();
          window.scrollTo(0, scrollY);

          toast('🔄 Данные обновлены', 'ok', 2000);
        }
      } catch (err) {
        console.error('[WS] Ошибка обработки sync:', err);
      }
    };

    ws.onclose = () => {
      console.log(`[WS] Отключено, переподключение через ${reconnectDelay / 1000}с...`);
      setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
        connectWS();
      }, reconnectDelay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  connectWS();
}

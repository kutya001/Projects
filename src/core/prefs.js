// src/core/prefs.js
// Local user interface preferences stored in browser localStorage
const PREFS_KEY = 'projects_spa_prefs';

const DEFAULT_MODULES = {
  projects: true,
  tasks: false,
  changes: false
};

export function loadPrefs(S) {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      S.prefs = Object.assign(S.prefs || {}, parsed);
    }
  } catch (e) {
    console.warn('Failed to load local prefs:', e);
  }

  // Ensure modules structure exists and conforms to rules
  if (!S.prefs.modules || typeof S.prefs.modules !== 'object') {
    S.prefs.modules = { ...DEFAULT_MODULES };
  } else {
    // If all false, reset to projects=true
    if (!S.prefs.modules.projects && !S.prefs.modules.tasks && !S.prefs.modules.changes) {
      S.prefs.modules.projects = true;
    }
    // Dependent toggle logic: changes can only be active if tasks is active
    if (S.prefs.modules.changes && !S.prefs.modules.tasks) {
      S.prefs.modules.changes = false;
    }
  }

  // Ensure separate kbCards and tlCards exist
  S.prefs.kbCards = S.prefs.kbCards || {};
  S.prefs.tlCards = S.prefs.tlCards || {};

  // Backwards compatibility migration from legacy S.prefs.cards
  if (S.prefs.cards) {
    ['projects', 'tasks', 'changes'].forEach(ent => {
      if (S.prefs.cards[ent]) {
        if (!S.prefs.kbCards[ent]) S.prefs.kbCards[ent] = [...S.prefs.cards[ent]];
        if (!S.prefs.tlCards[ent]) S.prefs.tlCards[ent] = [...S.prefs.cards[ent]];
      }
    });
  }
}

export function savePrefs(S) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(S.prefs));
  } catch (e) {
    console.warn('Failed to save local prefs:', e);
  }
}

export function tblState(S, tid, allKeys) {
  S.prefs.tables = S.prefs.tables || {};
  S.prefs.tables[tid] = S.prefs.tables[tid] || {};
  const st = S.prefs.tables[tid];
  let order = (st.order || []).filter(k => allKeys.includes(k));
  allKeys.forEach(k => {
    if (!order.includes(k)) order.push(k);
  });
  st.order = order;
  st.hidden = (st.hidden || []).filter(k => allKeys.includes(k));
  st.filters = st.filters || {};
  return st;
}

export function cardFields(S, ent, view = 'kb') {
  const isKb = view === 'kb';
  const prefKey = isKb ? 'kbCards' : 'tlCards';
  S.prefs[prefKey] = S.prefs[prefKey] || {};

  const all = ['num', 'name', 'dates', 'status', 'priority', 'owner', 'project', 'stage', 'progress', 'lastNote', 'checklists'];

  if (!S.prefs[prefKey][ent]) {
    if (ent === 'projects') {
      S.prefs[prefKey][ent] = isKb
        ? ['num', 'name', 'dates', 'status', 'priority', 'stage', 'progress', 'lastNote']
        : ['num', 'name', 'dates', 'status', 'priority', 'stage', 'progress'];
    } else {
      S.prefs[prefKey][ent] = isKb
        ? ['num', 'name', 'dates', 'status', 'priority', 'owner', 'project', 'lastNote']
        : ['num', 'name', 'dates', 'status', 'priority', 'owner', 'project'];
    }
  }

  return { list: S.prefs[prefKey][ent], all, prefKey };
}

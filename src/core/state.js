// src/core/state.js
import { bus } from './events.js';

const S = {
  projects: [],
  tasks: [],
  changes: [],
  employees: [],
  customers: [],
  priorities: [],
  taskStatuses: [],
  projectStatuses: [],
  stages: [],
  stageHistory: [],
  history: [],
  kanbanBoards: [],
  formLayouts: [],
  auditLogs: [],
  prefs: {
    tables: {},
    cards: {},
    views: {},
    kanbanGroup: {},
    tlGroup: {},
    tlMode: {},
    tlColor: {}
  },
  counters: { p: 0, t: 0, c: 0 },
  lastSaved: null,
  lastExport: null,
  fileHandle: null,
  search: '',
  page: 'projects'
};

export const EXP = {
  projects: new Set(),
  tasks: new Set()
};

export const ROWCAP = 800;

export const state = {
  get: (key) => S[key],
  set: (key, value) => {
    S[key] = value;
    bus.emit('state:change', { key, value });
  },
  patch: (key, patch) => {
    S[key] = { ...S[key], ...patch };
    bus.emit('state:change', { key, value: S[key] });
  },
  raw: () => S
};

export const ENT = {
  projects: { ru: 'Проекты', one: 'проект', acc: 'Проекты', letter: 'P', ctr: 'p' },
  tasks: { ru: 'Задачи', one: 'задача', acc: 'Задачи', letter: 'T', ctr: 't' },
  changes: { ru: 'Изменения', one: 'изменение', acc: 'Изменения', letter: 'C', ctr: 'c' },
  auditLogs: { ru: 'Журнал действий', one: 'запись журнала', acc: 'Журнал действий', letter: 'L', ctr: 'l' }
};

export const REFTABS = [
  ['employees', 'Сотрудники'],
  ['customers', 'Заказчики'],
  ['priorities', 'Приоритеты'],
  ['taskStatuses', 'Статусы задач/изменений'],
  ['projectStatuses', 'Статусы проектов'],
  ['stages', 'Этапы проектов']
];

export const REFNAME = {
  employees: 'Сотрудник',
  customers: 'Заказчик',
  priorities: 'Приоритет',
  taskStatuses: 'Статус',
  projectStatuses: 'Статус проекта',
  stages: 'Этап'
};

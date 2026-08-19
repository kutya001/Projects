// src/components/table/colDefs.js
export function col(k, label, type, o = {}) {
  return { k, label, type, ...o };
}

export function getColDefs(S) {
  const mods = S.prefs?.modules || { projects: true, tasks: false, changes: false };

  const projectCols = [
    col('num', '№', 'text', { w: 74 }),
    col('name', 'Название', 'text', { w: 260 }),
    col('customerId', 'Заказчик', 'select', { dir: () => S.customers || [] }),
    col('statusId', 'Статус', 'select', { dir: () => S.projectStatuses }),
    col('priorityId', 'Приоритет', 'select', { dir: () => S.priorities }),
    col('stagesChart', 'Этапы', 'stagesChart', { w: 140 }),
    col('devId', 'Разработчик (гл.)', 'select', { dir: () => (S.employees || []).filter(e => e.role === 'dev' && e.active !== false && e.active !== 0) }),
    col('agentId', 'Агент (ПМ / Аналитик)', 'select', { dir: () => (S.employees || []).filter(e => e.role === 'agent' && e.active !== false && e.active !== 0) }),
    col('progress', 'Итог %', 'percent', { w: 90 }),
    col('lastNote', 'Заметка', 'text', { w: 240 }),
    col('checklistsProgress', 'Чек-лист', 'checklist', { w: 110 }),
    col('start', 'Начало', 'date'),
    col('end', 'Конец', 'date')
  ];

  if (mods.tasks) {
    projectCols.push(col('tasksCount', 'Задач', 'number'));
  }

  projectCols.push(
    col('agents', 'Агенты (участ.)', 'multi', { role: 'agent', dir: () => (S.employees || []).filter(e => e.role === 'agent' && e.active !== false && e.active !== 0) }),
    col('devs', 'Разработчики (участ.)', 'multi', { role: 'dev', dir: () => (S.employees || []).filter(e => e.role === 'dev' && e.active !== false && e.active !== 0) }),
    col('desc', 'Описание', 'text'),
    col('createdAt', 'Создан', 'date'),
    col('updatedAt', 'Изменен', 'date')
  );

  const taskCols = [
    col('num', '№', 'text', { w: 74 }),
    col('name', 'Название', 'text', { w: 260 }),
    col('projectId', 'Проект', 'select', { dir: () => S.projects }),
    col('customerId', 'Заказчик', 'select', { dir: () => S.customers || [] }),
    col('statusId', 'Статус', 'select', { dir: () => S.taskStatuses }),
    col('priorityId', 'Приоритет', 'select', { dir: () => S.priorities }),
    col('devId', 'Разработчик (гл.)', 'select', { dir: () => (S.employees || []).filter(e => e.role === 'dev' && e.active !== false && e.active !== 0) }),
    col('agentId', 'Агент (ПМ / Аналитик)', 'select', { dir: () => (S.employees || []).filter(e => e.role === 'agent' && e.active !== false && e.active !== 0) }),
    col('lastNote', 'Заметка', 'text', { w: 240 }),
    col('checklistsProgress', 'Чек-лист', 'checklist', { w: 110 }),
    col('extNum', '№ в системе', 'text'),
    col('extLink', 'Ссылка', 'link'),
    col('start', 'Начало', 'date'),
    col('end', 'Конец', 'date')
  ];

  if (mods.changes) {
    taskCols.push(col('changesCount', 'Изменений', 'number'));
  }

  taskCols.push(
    col('agents', 'Агенты (участ.)', 'multi', { role: 'agent', dir: () => (S.employees || []).filter(e => e.role === 'agent' && e.active !== false && e.active !== 0) }),
    col('devs', 'Разработчики (участ.)', 'multi', { role: 'dev', dir: () => (S.employees || []).filter(e => e.role === 'dev' && e.active !== false && e.active !== 0) }),
    col('desc', 'Описание', 'text'),
    col('createdAt', 'Создана', 'date'),
    col('updatedAt', 'Изменена', 'date')
  );

  return {
    projects: projectCols,
    tasks: taskCols,
    changes: [
      col('num', '№', 'text', { w: 74 }),
      col('name', 'Название', 'text', { w: 260 }),
      col('taskId', 'Задача', 'select', { dir: () => S.tasks }),
      col('customerId', 'Заказчик', 'select', { dir: () => S.customers || [] }),
      col('statusId', 'Статус', 'select', { dir: () => S.taskStatuses }),
      col('priorityId', 'Приоритет', 'select', { dir: () => S.priorities }),
      col('devId', 'Разработчик (гл.)', 'select', { dir: () => (S.employees || []).filter(e => e.role === 'dev' && e.active !== false && e.active !== 0) }),
      col('agentId', 'Агент (ПМ / Аналитик)', 'select', { dir: () => (S.employees || []).filter(e => e.role === 'agent' && e.active !== false && e.active !== 0) }),
      col('lastNote', 'Заметка', 'text', { w: 240 }),
      col('checklistsProgress', 'Чек-лист', 'checklist', { w: 110 }),
      col('extNum', '№ в системе', 'text'),
      col('extLink', 'Ссылка', 'link'),
      col('start', 'Начало', 'date'),
      col('end', 'Конец', 'date'),
      col('desc', 'Описание', 'text'),
      col('createdAt', 'Создано', 'date'),
      col('updatedAt', 'Изменено', 'date')
    ],
    customers: [
      col('name', 'Название заказчика', 'text'),
      col('contacts', 'Контактные данные', 'text'),
      col('desc', 'Описание', 'text'),
      col('note', 'Примечание', 'text')
    ],
    employees: [
      col('color', 'Цвет', 'color', { w: 80 }),
      col('name', 'ФИО / Название', 'text'),
      col('role', 'Роль', 'role', { dir: () => [{ id: 'dev', name: 'Разработчик' }, { id: 'agent', name: 'Агент (ПМ / Аналитик)' }] }),
      col('position', 'Должность / Специализация', 'text'),
      col('desc', 'Описание', 'text'),
      col('note', 'Примечание', 'text'),
      col('active', 'Статус', 'active', { dir: () => [{ id: '1', name: '● Активен' }, { id: '0', name: '○ Неактивен' }] })
    ],
    priorities: [
      col('color', 'Цвет', 'color', { w: 80 }),
      col('name', 'Название', 'text'),
      col('weight', 'Вес (1=высший)', 'number'),
      col('desc', 'Описание', 'text'),
      col('note', 'Примечание', 'text')
    ],
    taskStatuses: [
      col('color', 'Цвет', 'color', { w: 80 }),
      col('name', 'Название', 'text'),
      col('order', 'Порядок', 'number'),
      col('desc', 'Описание', 'text'),
      col('note', 'Примечание', 'text')
    ],
    projectStatuses: [
      col('color', 'Цвет', 'color', { w: 80 }),
      col('name', 'Название', 'text'),
      col('order', 'Порядок', 'number'),
      col('desc', 'Описание', 'text'),
      col('note', 'Примечание', 'text')
    ],
    stages: [
      col('color', 'Цвет', 'color', { w: 80 }),
      col('name', 'Название', 'text'),
      col('order', 'Порядок', 'number'),
      col('desc', 'Описание', 'text'),
      col('note', 'Примечание', 'text')
    ],
    stageHistory: [
      col('ts', 'Дата и время', 'datetime', { w: 160 }),
      col('projectId', 'Проект', 'select', { dir: () => S.projects, w: 260 }),
      col('stageId', 'Этап', 'select', { dir: () => S.stages, w: 160 }),
      col('from', 'Было %', 'number', { w: 85 }),
      col('to', 'Стало %', 'number', { w: 85 }),
      col('delta', 'Динамика %', 'stageDelta', { w: 110 })
    ],
    kanbanBoards: [
      col('module', 'Модуль', 'text', { w: 120 }),
      col('name', 'Название доски', 'text', { w: 220 }),
      col('columns', 'Конфигурация колонок (JSON)', 'text', { w: 320 }),
      col('wipLimits', 'WIP-лимиты (JSON)', 'text', { w: 200 }),
      col('createdAt', 'Создано', 'datetime', { w: 150 }),
      col('updatedAt', 'Обновлено', 'datetime', { w: 150 })
    ],
    formLayouts: [
      col('key', 'Ключ формы', 'text', { w: 200 }),
      col('layout', 'Макет полей (JSON)', 'text', { w: 380 }),
      col('updatedAt', 'Обновлено', 'datetime', { w: 150 })
    ],
    meta: [
      col('key', 'Параметр / Ключ', 'text', { w: 220 }),
      col('value', 'Значение (JSON)', 'text', { w: 400 })
    ],
    auditLogs: [
      col('ts', 'Дата и время', 'datetime', { w: 160 }),
      col('ip', 'IP-адрес', 'text', { w: 130 }),
      col('action', 'Действие', 'logAction', { w: 160 }),
      col('entity', 'Модуль / Таблица', 'logEntity', { w: 150 }),
      col('target', 'Объект / Запись', 'text', { w: 200 }),
      col('field', 'Поле', 'logField', { w: 160 }),
      col('details', 'Детали изменений', 'logDetails', { w: 320 }),
      col('userAgent', 'Клиент / Браузер', 'text', { w: 180 })
    ]
  };
}

export const DEFAULT_HIDDEN = {
  projects: ['desc', 'agents', 'devs', 'createdAt'],
  tasks: ['desc', 'agents', 'devs', 'changesCount', 'createdAt', 'extLink'],
  changes: ['desc', 'extLink', 'createdAt'],
  employees: [],
  priorities: [],
  taskStatuses: [],
  projectStatuses: [],
  stages: [],
  stageHistory: [],
  kanbanBoards: [],
  formLayouts: [],
  meta: [],
  auditLogs: ['userAgent']
};

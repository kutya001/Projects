// src/services/seed.js
import { db, refreshAll } from '../core/db.js';
import { todayISO, addDays, nowIso } from '../utils/date.js';

export async function seedDemo(S, withProjects) {
  const ps = [
    ['В процессе', '#2F9E63', 'Проект находится в активной фазе реализации', 'Требует регулярного контроля'],
    ['Отложен', '#E8A13C', 'Работы приостановлены по решению заказчика', 'Ожидаются вводные данные'],
    ['Очередь', '#7B8AA6', 'Запланирован к старту в следующем спринте', 'Формируется команда'],
    ['Отменен', '#D1495B', 'Проект полностью закрыт до реализации', 'Архивирован'],
    ['Отозван', '#9C7BC0', 'Заявка отозвана контрагентом', '']
  ];
  const ts = [
    ['Бэклог', '#8A94A6', 1, 'Задача запланирована в общий список', ''],
    ['В работе', '#2D7DD2', 2, 'Разработчик приступил к выполнению', ''],
    ['Ревью', '#7C5CFC', 3, 'Код находится на проверке у Senior-разработчика', ''],
    ['Тестирование', '#E8A13C', 4, 'Проверка функциональности аналитиком/тестировщиком', ''],
    ['Готово', '#2F9E63', 5, 'Задача успешно сдана и проверена', ''],
    ['Блокировано', '#D1495B', 6, 'Выполнение невозможно из-за внешней блокер-задачи', '']
  ];
  const pr = [
    ['Критический', '#C6362C', 1, 'Высший приоритет, требует немедленного внимания', 'Срочно'],
    ['Высокий', '#E86A2E', 2, 'Важная задача текущего релиза', ''],
    ['Средний', '#E3B23C', 3, 'Стандартный приоритет выполнения', ''],
    ['Низкий', '#7C9CBF', 4, 'Задачи с низким приоритетом или техдолг', '']
  ];
  const st = [
    ['Rec', '#38A3D8', 1, 'Аналитика и сбор требований', 'Изучение ТЗ'],
    ['Dev', '#7C5CFC', 2, 'Основная разработка функционала', ''],
    ['Test', '#E8A13C', 3, 'Интеграционное и нагрузочное тестирование', ''],
    ['UAT', '#2F9E63', 4, 'Приемка заказчиком и опытная эксплуатация', '']
  ];
  const cust = [
    ['ПАО «Системы»', '+7 (495) 123-45-67, info@systems.ru', 'Крупный корпоративный заказчик (IT-инфраструктура)', 'Договор №12-А от 15.01.2026'],
    ['АК «Вектор»', '+7 (812) 987-65-43, contact@vector.ru', 'Автомобильный консалтинг и аналитика', 'Представитель: Смирнова А.В.'],
    ['ООО «ТехноИмпорт»', 'tech@import.io', 'Поставка и интеграция оборудования', 'Ожидает обновления КП']
  ];
  const emp = [
    ['Антонов Егор', 'dev', 'Senior-разработчик', '#2D7DD2', 'Ведущий разработчик серверной части', ''],
    ['Соколова Мария', 'dev', 'Middle-разработчик', '#E86A9E', 'Фронтенд разработчик (React/Vue)', ''],
    ['Ким Денис', 'dev', 'Fullstack', '#2F9E63', 'Разработчик мобильных и веб-систем', ''],
    ['Гусев Павел', 'dev', 'Junior-разработчик', '#E8A13C', 'Инженер по тестированию и поддержке', ''],
    ['Иванова Елена', 'agent', 'Проект-менеджер', '#7C5CFC', 'Отвечает за коммуникацию и сроки', ''],
    ['Петров Алексей', 'agent', 'Бизнес-аналитик', '#38A3D8', 'Сбор требований и подготовка ТЗ', '']
  ];

  await db.projectStatuses.bulkAdd(ps.map(p => ({ name: p[0], color: p[1], desc: p[2], note: p[3] })));
  await db.taskStatuses.bulkAdd(ts.map(p => ({ name: p[0], color: p[1], order: p[2], desc: p[3], note: p[4] })));
  await db.priorities.bulkAdd(pr.map(p => ({ name: p[0], color: p[1], weight: p[2], desc: p[3], note: p[4] })));
  await db.stages.bulkAdd(st.map(p => ({ name: p[0], color: p[1], order: p[2], desc: p[3], note: p[4] })));
  await db.customers.bulkAdd(cust.map(c => ({ name: c[0], contacts: c[1], desc: c[2], note: c[3] })));
  await db.employees.bulkAdd(emp.map(p => ({ name: p[0], role: p[1], position: p[2], color: p[3], desc: p[4], note: p[5], active: 1 })));

  if (withProjects) {
    await addDemoProjects(S);
  }
}

export async function addDemoProjects(S) {
  await refreshAll(S);
  const stId = n => S.projectStatuses.find(x => x.name === n)?.id;
  const tsId = n => S.taskStatuses.find(x => x.name === n)?.id;
  const prId = n => S.priorities.find(x => x.name === n)?.id;
  const sgId = n => S.stages.find(x => x.name === n)?.id;
  const eId = n => S.employees.find(x => x.name === n)?.id;
  const cId = n => S.customers.find(x => x.name === n)?.id;
  const T = todayISO(), d = n => addDays(T, n);

  let pCount = S.projects.length;
  let tCount = S.tasks.length;
  let cCount = S.changes.length;

  pCount++;
  const p1 = {
    num: 'P-' + String(pCount).padStart(3, '0'),
    name: 'CRM: миграция на новый биллинг',
    desc: 'Перевод расчетов клиентов на новую модель',
    note: 'Приоритетный проект года',
    statusId: stId('В процессе'),
    priorityId: prId('Высокий'),
    stageId: sgId('Dev'),
    devId: eId('Антонов Егор'),
    agentId: eId('Иванова Елена'),
    customerId: cId('ПАО «Системы»'),
    start: d(-20),
    end: d(45),
    stageProgress: { [sgId('Rec')]: 100, [sgId('Dev')]: 40, [sgId('Test')]: 0, [sgId('UAT')]: 0 },
    agents: [eId('Иванова Елена'), eId('Петров Алексей')],
    devs: [eId('Антонов Егор'), eId('Соколова Мария')],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  p1.id = await db.projects.add(p1);

  pCount++;
  const p2 = {
    num: 'P-' + String(pCount).padStart(3, '0'),
    name: 'Мобильное приложение v2.0',
    desc: 'Редизайн и офлайн-режим',
    note: 'Этап ревью и сбора требований',
    statusId: stId('В процессе'),
    priorityId: prId('Критический'),
    stageId: sgId('Rec'),
    devId: eId('Ким Денис'),
    agentId: eId('Петров Алексей'),
    customerId: cId('АК «Вектор»'),
    start: d(-5),
    end: d(60),
    stageProgress: { [sgId('Rec')]: 70 },
    agents: [eId('Петров Алексей')],
    devs: [eId('Ким Денис')],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  p2.id = await db.projects.add(p2);

  pCount++;
  const p3 = {
    num: 'P-' + String(pCount).padStart(3, '0'),
    name: 'Портал самообслуживания',
    desc: 'Личный кабинет для корпоративных клиентов',
    note: 'Согласование бюджета',
    statusId: stId('Очередь'),
    priorityId: prId('Средний'),
    stageId: null,
    customerId: cId('ООО «ТехноИмпорт»'),
    start: d(30),
    end: d(120),
    stageProgress: {},
    agents: [],
    devs: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  p3.id = await db.projects.add(p3);

  const tasks = [
    [p1.id, 'Схема биллинг-аккаунта', 'Готово', 'Низкий', 'Антонов Егор', 'Иванова Елена', cId('ПАО «Системы»'), d(-20), d(-12), 'EXT-101', 'https://example.com/EXT-101'],
    [p1.id, 'API тарифов', 'В работе', 'Высокий', 'Антонов Егор', 'Петров Алексей', cId('ПАО «Системы»'), d(-10), d(8), 'EXT-102', 'https://example.com/EXT-102'],
    [p1.id, 'Фронт: панель расчетов', 'В работе', 'Высокий', 'Соколова Мария', null, cId('ПАО «Системы»'), d(-6), d(14), 'EXT-103', ''],
    [p1.id, 'Интеграция 1С', 'Блокировано', 'Критический', 'Ким Денис', 'Иванова Елена', cId('ПАО «Системы»'), d(2), d(20), 'EXT-104', ''],
    [p1.id, 'Отчеты по начислениям', 'Бэклог', 'Средний', 'Гусев Павел', null, cId('ПАО «Системы»'), d(15), d(32), 'EXT-105', ''],
    [p2.id, 'Прототипы экранов', 'Ревью', 'Высокий', 'Ким Денис', 'Петров Алексей', cId('АК «Вектор»'), d(-4), d(4), 'MB-11', ''],
    [p2.id, 'Офлайн-хранилище', 'Бэклог', 'Критический', 'Ким Денис', null, cId('АК «Вектор»'), d(6), d(26), 'MB-12', ''],
    [p2.id, 'Пуш-уведомления', 'Бэклог', 'Низкий', 'Соколова Мария', null, cId('АК «Вектор»'), d(20), d(38), 'MB-13', ''],
    [p1.id, 'Нагрузочное тестирование API', 'Тестирование', 'Высокий', 'Гусев Павел', null, cId('ПАО «Системы»'), d(-2), d(6), 'EXT-106', '']
  ];

  for (const t of tasks) {
    tCount++;
    const obj = {
      num: 'T-' + String(tCount).padStart(3, '0'),
      projectId: t[0],
      name: t[1],
      statusId: tsId(t[2]),
      priorityId: prId(t[3]),
      devId: eId(t[4]),
      agentId: t[5] ? eId(t[5]) : null,
      customerId: t[6] || null,
      start: t[7],
      end: t[8],
      extNum: t[9],
      extLink: t[10],
      agents: [],
      devs: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    obj.id = await db.tasks.add(obj);

    if (t[1] === 'API тарифов') {
      for (let i = 0; i < 3; i++) {
        cCount++;
        await db.changes.add({
          num: 'C-' + String(cCount).padStart(3, '0'),
          taskId: obj.id,
          name: 'Правка спецификации №' + (i + 1),
          statusId: tsId(['Готово', 'В работе', 'Бэклог'][i]),
          priorityId: prId('Средний'),
          devId: eId('Антонов Егор'),
          agentId: eId('Петров Алексей'),
          customerId: cId('ПАО «Системы»'),
          start: d(-3 + i * 3),
          end: d(-1 + i * 3),
          extNum: 'CHG-' + (200 + i),
          extLink: '',
          agents: [],
          devs: [],
          createdAt: nowIso(),
          updatedAt: nowIso()
        });
      }
    }
  }

  await db.stageHistory.bulkAdd([
    { projectId: p1.id, ts: addDays(T, -18) + 'T10:20:00', stageId: sgId('Rec'), from: 0, to: 60 },
    { projectId: p1.id, ts: addDays(T, -12) + 'T15:05:00', stageId: sgId('Rec'), from: 60, to: 100 },
    { projectId: p1.id, ts: addDays(T, -9) + 'T09:40:00', stageId: sgId('Dev'), from: 0, to: 25 },
    { projectId: p1.id, ts: addDays(T, -2) + 'T17:12:00', stageId: sgId('Dev'), from: 25, to: 40 }
  ]);
}

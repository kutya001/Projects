# Техническая документация платформы «Projects SPA»

**Автор**: Омуралиев Кутман  
**Версия**: 2.5.0  
**Репозиторий**: [https://github.com/kutya001/Projects.git](https://github.com/kutya001/Projects.git)

---

## 1. Обзор архитектуры

**Projects SPA** — это высокопроизводительная одностраничная корпоративная веб-платформа (Single Page Application) с асинхронным бэкендом на Python, предназначенная для комплексного управления проектами, задачами, запросами на изменения и сквозного мониторинга прогресса.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                             КЛИЕНТСКИЙ СЛОЙ                              │
│  Vanilla JavaScript (ES Modules) · HTML5 · CSS3 · Linear SVG Outline     │
│  ┌───────────────┬────────────────┬─────────────────┬──────────────────┐  │
│  │   Таблицы     │    Канбан      │ Таймлайн (Гант) │ Отчёты Power BI  │  │
│  ├───────────────┼────────────────┼─────────────────┼──────────────────┤  │
│  │ Инспектор БД  │  Журнал этапов │  Журнал аудита  │   Справочники    │  │
│  └───────────────┴────────────────┴─────────────────┴──────────────────┘  │
└────────────────────────────────────▲─────────────────────────────────────┘
                                     │ REST API (JSON) + WebSocket (/ws)
┌────────────────────────────────────▼─────────────────────────────────────┐
│                            СЕРВЕРНЫЙ БЭКЕНД                              │
│                Python 3.10+ · aiohttp · aiosqlite · PyInstaller          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  REST API Router · WebSocket Sync Broadcast · Audit Event Logger   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────▲─────────────────────────────────────┘
                                     │ WAL Mode (busy_timeout=5000)
┌────────────────────────────────────▼─────────────────────────────────────┐
│                       ХРАНИЛИЩЕ ДАННЫХ (SQLite 3)                        │
│                              projects.db                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

### Основные компоненты:
1. **Frontend**: Чистый JavaScript (Zero-Build ES Modules) без тяжелых фреймворков (React, Vue, Angular). Это гарантирует мгновенную инициализацию, минимальное потребление оперативной памяти и полный контроль над DOM-деревом.
2. **Backend**: Асинхронный веб-сервер на Python `aiohttp` с пулом подключений `aiosqlite` и защитой от конфликтов конкурентного доступа.
3. **Database**: SQLite 3 в режиме Write-Ahead Logging (`PRAGMA journal_mode=WAL`), обеспечивающий одновременное чтение и запись без блокировок.
4. **Real-time Sync**: Двунаправленный WebSocket-канал `/ws`, мгновенно распространяющий сигналы синхронизации на все открытые клиенты при любых изменениях.
5. **Standalone Binary**: Сборка всего приложения (сервер, статические ресурсы, шрифты, стили) в один исполняемый файл Windows `ProjectsSPA.exe` с помощью PyInstaller.

---

## 2. Структура директорий проекта

```text
Projects/
├── ProjectsSPA.spec          # Конфигурация сборщика PyInstaller
├── build.bat                 # Скрипт быстрой компиляции в .exe
├── server.py                 # Сервер aiohttp + aiosqlite REST API & WebSocket
├── index.html                # Главная HTML-страница (каркас приложения)
├── package.json              # Метаданные проекта
├── requirements.txt          # Python зависимости (aiohttp, aiosqlite)
├── README.md                 # Описание проекта и руководство пользователя
├── Doc.md                    # Данная техническая документация
├── dist/
│   └── ProjectsSPA.exe       # Готовый автономный исполняемый файл
├── styles/                   # Модульная система CSS-стилей
│   ├── main.css              # Базовые токены, шрифты (Inter, Unbounded, JetBrains Mono)
│   ├── layout.css            # Разметка каркаса, сайдбар, топбар
│   ├── components/           # Стили компонентов (таблица, канбан, таймлайн, модалки)
│   └── modules/              # Стили страниц (отчеты, аудит, инспектор)
└── src/
    ├── app.js                # Точка входа SPA, инициализация, роутер, WS-клиент
    ├── core/                 # Ядро приложения
    │   ├── api.js            # HTTP-клиент для работы с REST API сервера
    │   ├── db.js             # Клиентский слой данных и кэш
    │   ├── state.js          # Глобальное состояние приложения (объект S)
    │   ├── events.js         # Event Bus (шина событий)
    │   ├── prefs.js          # Пользовательские настройки (localStorage)
    │   └── router.js         # Хэш-роутер с поддержкой очистки фильтров
    ├── pages/                # Страницы и контроллеры модулей
    │   ├── projects.js       # Модуль «Проекты»
    │   ├── tasks.js          # Модуль «Задачи»
    │   ├── changes.js        # Модуль «Изменения» (Change Requests)
    │   ├── reports.js        # Сквозная аналитика, Power BI дашборды и графики
    │   ├── stageHistory.js   # Журнал изменения этапов проектов
    │   ├── refs.js           # Справочники (Сотрудники, Заказчики, Статусы)
    │   ├── logs.js           # Журнал действий и аудита с навигацией
    │   ├── dbInspector.js    # Прямой инспектор базы данных и SQL-консоль
    │   ├── settings.js       # Настройки, резервное копирование и авторство
    │   └── forms/            # Модальные формы сущностей и конструктор секций
    ├── components/           # Переиспользуемые сложные UI-представления
    │   ├── table/            # Таблица: многоуровневая группировка, фильтры, сортировка
    │   ├── kanban/           # Канбан-доска: Drag&Drop, WIP-лимиты, кастомные доски
    │   └── timeline/         # Диаграмма Ганта: интерактивные временные шкалы
    ├── services/             # Бизнес-сервисы
    │   ├── formLayout.js     # Интерактивный конструктор полей и форм
    │   ├── storage.js        # Резервное копирование и File System Access API
    │   └── quickActions.js   # Дублирование, конвертация и связи
    ├── ui/                   # Базовые UI-модули (модалки, поповеры, тосты)
    └── utils/                # Утилиты (DOM, даты, экранирование XSS, логирование)
```

---

## 3. Схема базы данных SQLite

База данных SQLite (`projects.db`) содержит 14 таблиц:

```sql
-- 1. Проекты
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT,
    name TEXT NOT NULL DEFAULT '',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT '',
    statusId INTEGER,
    priorityId INTEGER,
    stageId INTEGER,
    customerId INTEGER,
    devId INTEGER,
    agentId INTEGER,
    start TEXT,
    "end" TEXT,
    stageProgress TEXT DEFAULT '{}',  -- JSON: {"1": 100, "2": 80, ...}
    agents TEXT DEFAULT '[]',         -- JSON array: [ID1, ID2, ...]
    devs TEXT DEFAULT '[]',           -- JSON array: [ID1, ID2, ...]
    checklists TEXT DEFAULT '[]',     -- JSON array: [{id, text, done}, ...]
    notes TEXT DEFAULT '[]',          -- JSON array: [{id, text, author, createdAt}, ...]
    createdAt TEXT,
    updatedAt TEXT
);

-- 2. Задачи
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT,
    name TEXT NOT NULL DEFAULT '',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT '',
    projectId INTEGER,
    statusId INTEGER,
    priorityId INTEGER,
    agentId INTEGER,
    devId INTEGER,
    customerId INTEGER,
    start TEXT,
    "end" TEXT,
    extNum TEXT DEFAULT '',
    extLink TEXT DEFAULT '',
    agents TEXT DEFAULT '[]',
    devs TEXT DEFAULT '[]',
    checklists TEXT DEFAULT '[]',
    notes TEXT DEFAULT '[]',
    createdAt TEXT,
    updatedAt TEXT
);

-- 3. Изменения (Change Requests)
CREATE TABLE IF NOT EXISTS changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num TEXT,
    name TEXT NOT NULL DEFAULT '',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT '',
    taskId INTEGER,
    statusId INTEGER,
    priorityId INTEGER,
    agentId INTEGER,
    devId INTEGER,
    customerId INTEGER,
    start TEXT,
    "end" TEXT,
    extNum TEXT DEFAULT '',
    extLink TEXT DEFAULT '',
    agents TEXT DEFAULT '[]',
    devs TEXT DEFAULT '[]',
    checklists TEXT DEFAULT '[]',
    notes TEXT DEFAULT '[]',
    createdAt TEXT,
    updatedAt TEXT
);

-- 4. Сотрудники
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'dev',          -- 'dev' (Разработчик) | 'agent' (Агент / ПМ)
    position TEXT DEFAULT '',
    color TEXT DEFAULT '#2B6CB0',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT '',
    active INTEGER DEFAULT 1          -- 1 = Активен, 0 = Архив
);

-- 5. Заказчики
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contacts TEXT DEFAULT '',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

-- 6. Приоритеты
CREATE TABLE IF NOT EXISTS priorities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8A94A6',
    weight INTEGER DEFAULT 0,
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

-- 7. Статусы задач
CREATE TABLE IF NOT EXISTS taskStatuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8A94A6',
    "order" INTEGER DEFAULT 0,
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

-- 8. Статусы проектов
CREATE TABLE IF NOT EXISTS projectStatuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8A94A6',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

-- 9. Этапы проектов
CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#8A94A6',
    "order" INTEGER DEFAULT 0,
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

-- 10. Журнал изменения этапов
CREATE TABLE IF NOT EXISTS stageHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER,
    ts TEXT,
    stageId INTEGER,
    "from" INTEGER DEFAULT 0,
    "to" INTEGER DEFAULT 0
);

-- 11. Кастомные Канбан-доски
CREATE TABLE IF NOT EXISTS kanbanBoards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT,
    name TEXT,
    columns TEXT DEFAULT '[]',
    wipLimits TEXT DEFAULT '{}',
    createdAt TEXT,
    updatedAt TEXT
);

-- 12. Раскладки форм
CREATE TABLE IF NOT EXISTS formLayouts (
    formKey TEXT PRIMARY KEY,
    layout TEXT DEFAULT '[]',
    updatedAt TEXT
);

-- 13. Журнал действий и аудита
CREATE TABLE IF NOT EXISTS auditLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT,
    ip TEXT,
    action TEXT,                      -- 'create' | 'update' | 'delete' | 'login'
    entity TEXT,                      -- 'projects' | 'tasks' | ...
    target TEXT,                      -- 'P-001 · Название'
    field TEXT,                       -- 'statusId, priorityId'
    details TEXT DEFAULT '{}',        -- JSON: { changes: { field: { from, to } } }
    userAgent TEXT
);

-- 14. Системные метаданные
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

---

## 4. Спецификация REST API и WebSocket

### Generic CRUD Endpoints:
- `GET /api/{table}` — получение списка всех записей таблицы.
- `GET /api/{table}/{id}` — получение записи по идентификатору.
- `POST /api/{table}` — создание новой записи.
- `PUT /api/{table}/{id}` — обновление существующей записи.
- `DELETE /api/{table}/{id}` — удаление записи.
- `DELETE /api/{table}` — полная очистка таблицы.
- `POST /api/{table}/bulk` — пакетная вставка записей.

### Специальные эндпоинты:
- `GET /api/all` — получение полного слепка всех таблиц за один сетевой запрос.
- `GET /api/snapshot` / `POST /api/snapshot` — выгрузка и восстановление полного JSON-снимка базы данных.
- `GET /api/db/schema` — интроспекция таблиц и колонок SQLite базы данных.
- `POST /api/sql/execute` — прямое выполнение SQL-запросов из встроенной SQL-консоли (с возвратом колонок и строк).
- `GET /api/meta/{key}` / `PUT /api/meta/{key}` — хранение метаданных и настроек.

### WebSocket канал (`/ws`):
- При любом изменении данных сервер отправляет широковещательное сообщение `{"type": "sync", "source": "<clientId>"}`.
- Клиенты сравнивают `source` со своим уникальным `CLIENT_ID` и обновляют состояние `refreshAll(S)` без повторного рендера на стороне инициатора.

---

### 1. Единая компактная верхняя панель (Unified Topbar)
- Интеграция названия текущего модуля, бейджа общего количества записей, строки глобального поиска, кнопок создания (`+ Проект`, `+ Задача`, `+ Изменение`), выгрузки шаблонов импорта, переключателя представлений (`Таблица`, `Канбан`, `Гант`) и индикатора состояния подключения к SQLite в одну компактную строку.

### 2. Табличное представление (`TableView.js` и `filters.js`)
- **Многоуровневая группировка**: группировка записей по любым двум полям с подсчетом количества строк и независимым сворачиванием/разворачиванием.
- **In-Header фильтры**: в заголовках колонок (`<th>`) встроены иконки воронки, открывающие поповер со списком уникальных значений.
- **Алфавитная сортировка**: значения в фильтрах сортируются по алфавиту (`localeCompare`) и отображают исключительно те записи, которые присутствуют в строках таблицы.
- **Индикатор применённых фильтров**: красный бейдж `Применено фильтров: N ✕ Сбросить`, моментально очищающий срезы и строку поиска.

### 3. Канбан и Диаграмма Ганта (`KanbanView.js`, `TimelineView.js`, `viewFilters.js`)
- **Компактная кнопка фильтрации**: всплывающий поповер для гибкой фильтрации карточек по статусам, этапам, разработчикам, агентам и заказчикам с индикатором количества активных условий.
- **Фильтрация активных сотрудников**: на таймлайне в группировках по разработчикам и агентам отображаются только активные сотрудники.
- **Сохранение кэшированной позиции скролла**: таймлайн восстанавливает позицию прокрутки из кэша и не прыгает принудительно на сегодняшнюю дату.

### 4. Карточка объекта и мини-графики этапов (`ViewForm.js`)
- **Компоновка**: Номер/код расположен в самом верху (`ПРОЕКТЫ · 76.1.`), а название объекта — строго под ним.
- **Отсутствие визуального шума**: избыточное дублирование названия удалено.
- **Пакетное обновление этапов**: общие кнопки **[Применить]** и **[Отменить]** в шапке блока этапов позволяют изменять значения нескольких ползунков и сохранять их одной транзакцией с фиксацией дельт в истории.
- **Интерактивные мини-графики этапов**: в табе «История этапов» для каждого этапа отображаются Sparklines со сглаженными кривыми и градиентной заливкой с возможностью переключения срезов периода (Год / Квартал / Месяц / День) и фильтрации интервала дат.

### 5. Инспектор БД (`dbInspector.js`)
- Прямой просмотр сырых данных SQLite в моноширинном шрифте (`JetBrains Mono`).
- Отображение первичных ключей `id`, внешних ключей (`statusId`, `devId` и т.д.), JSON-структур.
- Встроенная SQL-консоль с поддержкой чтения (`SELECT`) и записи (`INSERT`, `UPDATE`, `DELETE`, `CREATE`), историей и готовыми шаблонами.

### 6. Журнал аудита (`logs.js`)
- Фиксация всех CRUD-операций с фиксацией разницы (`from → to`), IP-клиента и времени.
- Интерактивный переход на объект: клик по названию объекта в журнале сразу открывает карточку просмотра.

---

## 6. Сборка исполняемого файла

Сборка осуществляется при помощи PyInstaller и спецификации `ProjectsSPA.spec`:

```bash
py -3 -m PyInstaller ProjectsSPA.spec --noconfirm
```

### Параметры `ProjectsSPA.spec`:
- `onefile=True` — упаковка всех модулей и зависимостей в единый `.exe`.
- `datas` — включение в бинарный пакет директорий `src/`, `styles/`, `index.html`.
- `runtime` — при запуске сервер определяет распакованные ресурсы через `sys._MEIPASS` и автоматически запускает порт `3000`.

---

## 7. Автор и лицензия

- **Разработчик**: Омуралиев Кутман (*Kutman Omuraliev*)
- **Лицензия**: MIT License
- **Репозиторий проекта**: [https://github.com/kutya001/Projects.git](https://github.com/kutya001/Projects.git)

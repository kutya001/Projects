import sys
import os
import re
import json
import logging
import asyncio
import webbrowser
from datetime import datetime, timezone
from typing import Dict, Any, Set
from aiohttp import web
import aiohttp
import aiosqlite

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger('ProjectsSPA')

# Config
PORT = int(os.environ.get("PORT", 3000))
HOST = "0.0.0.0"

# Determine base path for static files and DB
if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
    BASE_DIR = getattr(sys, '_MEIPASS')
    DB_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    DB_DIR = BASE_DIR

CONFIG_PATH = os.path.join(DB_DIR, "server_config.json")

def load_db_path() -> str:
    """Load customized DB path from config or fallback to default."""
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                if cfg.get("db_path") and os.path.isabs(cfg["db_path"]):
                    return cfg["db_path"]
        except Exception as e:
            logger.warning(f"Failed to read config: {e}")
    return os.path.join(DB_DIR, "projects.db")

def save_db_path(new_path: str):
    """Save customized DB path to server_config.json."""
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump({"db_path": new_path}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to write config: {e}")

DB_PATH = load_db_path()

def get_client_ip(request: web.Request) -> str:
    """Extract real client IP address considering proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    if request.remote:
        return request.remote
    return "127.0.0.1"

def now_iso() -> str:
    """Return current UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()

async def record_audit_log(ip: str, action: str, entity: str = '', target: str = '', details: dict = None, user_agent: str = '', field: str = ''):
    """Asynchronously record an audit log entry in the auditLogs table."""
    try:
        ts = now_iso()
        details_str = json.dumps(details or {}, ensure_ascii=False)
        db = await get_db()
        try:
            await db.execute(
                "INSERT INTO auditLogs (ts, ip, action, entity, target, field, details, userAgent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (ts, ip, action, entity, target, field or '', details_str, user_agent or '')
            )
            await db.commit()
        finally:
            await db.close()
    except Exception as e:
        logger.error(f"Failed to record audit log: {e}")

# --- WebSocket connected clients ---
ws_clients: Set[web.WebSocketResponse] = set()


async def notify_clients(source_client_id: str = None):
    """Broadcast 'sync' to all connected WebSocket clients with source info."""
    msg = json.dumps({"type": "sync", "source": source_client_id})
    dead = set()
    for ws in list(ws_clients):
        try:
            await ws.send_str(msg)
        except Exception:
            dead.add(ws)
    ws_clients.difference_update(dead)


async def handle_ws(request):
    """WebSocket endpoint for real-time sync with connection logging."""
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    ws_clients.add(ws)
    ip = get_client_ip(request)
    ua = request.headers.get('User-Agent', '')
    logger.info(f"WS connected from {ip} ({len(ws_clients)} active clients)")
    await record_audit_log(ip, "connect", "system", "Подключение клиента", {"activeClients": len(ws_clients)}, ua, field="Сессия")
    try:
        async for msg in ws:
            if msg.type in (aiohttp.WSMsgType.ERROR, aiohttp.WSMsgType.CLOSE):
                break
    finally:
        ws_clients.discard(ws)
        logger.info(f"WS disconnected from {ip} ({len(ws_clients)} active clients)")
        await record_audit_log(ip, "disconnect", "system", "Отключение клиента", {"activeClients": len(ws_clients)}, ua, field="Сессия")
    return ws


JSON_COLUMNS = {
    "projects": ["stageProgress", "agents", "devs", "checklists", "notes"],
    "tasks": ["agents", "devs", "checklists", "notes"],
    "changes": ["agents", "devs", "checklists", "notes"],
    "kanbanBoards": ["columns", "wipLimits"],
    "auditLogs": ["details"],
    "formLayouts": ["layout"]
}

# Whitelist of allowed columns per table (prevents SQL injection and invalid column errors)
TABLE_COLUMNS = {
    "projects": [
        "num", "name", "desc", "note", "statusId", "priorityId",
        "stageId", "customerId", "devId", "agentId", "start", "end",
        "stageProgress", "agents", "devs", "checklists", "notes", "createdAt", "updatedAt"
    ],
    "tasks": [
        "num", "name", "desc", "note", "projectId", "statusId",
        "priorityId", "agentId", "devId", "customerId", "start", "end",
        "extNum", "extLink", "agents", "devs", "checklists", "notes", "createdAt", "updatedAt"
    ],
    "changes": [
        "num", "name", "desc", "note", "taskId", "statusId",
        "priorityId", "agentId", "devId", "customerId", "start", "end",
        "extNum", "extLink", "agents", "devs", "checklists", "notes", "createdAt", "updatedAt"
    ],
    "employees": [
        "name", "role", "position", "color", "desc", "note", "active"
    ],
    "customers": [
        "name", "contacts", "desc", "note"
    ],
    "priorities": [
        "name", "color", "weight", "desc", "note"
    ],
    "taskStatuses": [
        "name", "color", "order", "desc", "note"
    ],
    "projectStatuses": [
        "name", "color", "desc", "note"
    ],
    "stages": [
        "name", "color", "order", "desc", "note"
    ],
    "stageHistory": [
        "projectId", "ts", "stageId", "from", "to"
    ],
    "kanbanBoards": [
        "module", "name", "columns", "wipLimits", "createdAt", "updatedAt"
    ],
    "auditLogs": [
        "ts", "ip", "action", "entity", "target", "field", "details", "userAgent"
    ],
    "formLayouts": [
        "formKey", "layout", "updatedAt"
    ],
    "meta": [
        "key", "value"
    ]
}

TABLES = list(TABLE_COLUMNS.keys())

SCHEMA = """
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
    stageProgress TEXT DEFAULT '{}',
    agents TEXT DEFAULT '[]',
    devs TEXT DEFAULT '[]',
    checklists TEXT DEFAULT '[]',
    notes TEXT DEFAULT '[]',
    createdAt TEXT,
    updatedAt TEXT
);

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

CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    role TEXT DEFAULT '',
    position TEXT DEFAULT '',
    color TEXT DEFAULT '#2B6CB0',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT '',
    active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    contacts TEXT DEFAULT '',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS priorities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    color TEXT DEFAULT '#8A94A6',
    weight INTEGER DEFAULT 0,
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS taskStatuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    color TEXT DEFAULT '#8A94A6',
    "order" INTEGER DEFAULT 0,
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS projectStatuses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    color TEXT DEFAULT '#8A94A6',
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    color TEXT DEFAULT '#8A94A6',
    "order" INTEGER DEFAULT 0,
    "desc" TEXT DEFAULT '',
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS stageHistory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    projectId INTEGER,
    ts TEXT,
    stageId INTEGER,
    "from" INTEGER DEFAULT 0,
    "to" INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kanbanBoards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    module TEXT,
    name TEXT,
    columns TEXT DEFAULT '[]',
    wipLimits TEXT DEFAULT '{}',
    createdAt TEXT,
    updatedAt TEXT
);

CREATE TABLE IF NOT EXISTS auditLogs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT,
    ip TEXT,
    action TEXT,
    entity TEXT,
    target TEXT,
    field TEXT DEFAULT '',
    details TEXT DEFAULT '{}',
    userAgent TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS formLayouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    formKey TEXT UNIQUE NOT NULL,
    layout TEXT DEFAULT '{}',
    updatedAt TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_formLayouts_key ON formLayouts(formKey);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

# Reserved words in SQLite that need quoting
RESERVED = {'desc', 'end', 'from', 'to', 'order', 'key', 'value', 'group', 'index', 'table'}


def quote_col(col: str) -> str:
    """Quote column name if it's a reserved word."""
    return f'"{col}"' if col.lower() in RESERVED else col


async def get_db():
    """Get a database connection with WAL mode and Foreign Keys enabled."""
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL;")
    await db.execute("PRAGMA busy_timeout=5000;")
    await db.execute("PRAGMA foreign_keys=ON;")
    return db


async def init_db():
    """Initialize database schema and seed default dictionaries if needed."""
    db = await get_db()
    try:
        await db.executescript(SCHEMA)
        await db.commit()

        # Check if reference dictionaries need default initial seed
        cursor = await db.execute("SELECT COUNT(*) as count FROM taskStatuses")
        row = await cursor.fetchone()
        if row and row['count'] == 0:
            logger.info("Seeding default reference data into empty database...")
            # Project Statuses
            ps = [
                ('В процессе', '#2F9E63', 'Проект находится в активной фазе реализации', 'Требует регулярного контроля'),
                ('Отложен', '#E8A13C', 'Работы приостановлены по решению заказчика', 'Ожидаются вводные данные'),
                ('Очередь', '#7B8AA6', 'Запланирован к старту в следующем спринте', 'Формируется команда'),
                ('Отменен', '#D1495B', 'Проект полностью закрыт до реализации', 'Архивирован'),
                ('Отозван', '#9C7BC0', 'Заявка отозвана контрагентом', '')
            ]
            for name, color, desc, note in ps:
                await db.execute("INSERT INTO projectStatuses (name, color, \"desc\", note) VALUES (?, ?, ?, ?)", (name, color, desc, note))

            # Task Statuses
            ts = [
                ('Бэклог', '#8A94A6', 1, 'Задача запланирована в общий список', ''),
                ('В работе', '#2D7DD2', 2, 'Разработчик приступил к выполнению', ''),
                ('Ревью', '#7C5CFC', 3, 'Код находится на проверке у Senior-разработчика', ''),
                ('Тестирование', '#E8A13C', 4, 'Проверка функциональности аналитиком/тестировщиком', ''),
                ('Готово', '#2F9E63', 5, 'Задача успешно сдана и проверена', ''),
                ('Блокировано', '#D1495B', 6, 'Выполнение невозможно из-за внешней блокер-задачи', '')
            ]
            for name, color, order, desc, note in ts:
                await db.execute("INSERT INTO taskStatuses (name, color, \"order\", \"desc\", note) VALUES (?, ?, ?, ?, ?)", (name, color, order, desc, note))

            # Priorities
            pr = [
                ('Критический', '#C6362C', 1, 'Высший приоритет, требует немедленного внимания', 'Срочно'),
                ('Высокий', '#E86A2E', 2, 'Важная задача текущего релиза', ''),
                ('Средний', '#E3B23C', 3, 'Стандартный приоритет выполнения', ''),
                ('Низкий', '#7C9CBF', 4, 'Задачи с низким приоритетом или техдолг', '')
            ]
            for name, color, weight, desc, note in pr:
                await db.execute("INSERT INTO priorities (name, color, weight, \"desc\", note) VALUES (?, ?, ?, ?, ?)", (name, color, weight, desc, note))

            # Stages
            st = [
                ('Rec', '#38A3D8', 1, 'Аналитика и сбор требований', 'Изучение ТЗ'),
                ('Dev', '#7C5CFC', 2, 'Основная разработка функционала', ''),
                ('Test', '#E8A13C', 3, 'Интеграционное и нагрузочное тестирование', ''),
                ('UAT', '#2F9E63', 4, 'Приемка заказчиком и опытная эксплуатация', '')
            ]
            for name, color, order, desc, note in st:
                await db.execute("INSERT INTO stages (name, color, \"order\", \"desc\", note) VALUES (?, ?, ?, ?, ?)", (name, color, order, desc, note))

            # Customers
            cust = [
                ('ПАО «Системы»', '+7 (495) 123-45-67, info@systems.ru', 'Крупный корпоративный заказчик (IT-инфраструктура)', 'Договор №12-А от 15.01.2026'),
                ('АК «Вектор»', '+7 (812) 987-65-43, contact@vector.ru', 'Автомобильный консалтинг и аналитика', 'Представитель: Смирнова А.В.'),
                ('ООО «ТехноИмпорт»', 'tech@import.io', 'Поставка и интеграция оборудования', 'Ожидает обновления КП')
            ]
            for name, contacts, desc, note in cust:
                await db.execute("INSERT INTO customers (name, contacts, \"desc\", note) VALUES (?, ?, ?, ?)", (name, contacts, desc, note))

            # Employees
            emp = [
                ('Антонов Егор', 'dev', 'Senior-разработчик', '#2D7DD2', 'Ведущий разработчик серверной части', '', 1),
                ('Соколова Мария', 'dev', 'Middle-разработчик', '#E86A9E', 'Фронтенд разработчик (React/Vue)', '', 1),
                ('Ким Денис', 'dev', 'Fullstack', '#2F9E63', 'Разработчик мобильных и веб-систем', '', 1),
                ('Гусев Павел', 'dev', 'Junior-разработчик', '#E8A13C', 'Инженер по тестированию и поддержке', '', 1),
                ('Иванова Елена', 'agent', 'Проект-менеджер', '#7C5CFC', 'Отвечает за коммуникацию и сроки', '', 1),
                ('Петров Алексей', 'agent', 'Бизнес-аналитик', '#38A3D8', 'Сбор требований и подготовка ТЗ', '', 1)
            ]
            for name, role, position, color, desc, note, active in emp:
                await db.execute("INSERT INTO employees (name, role, position, color, \"desc\", note, active) VALUES (?, ?, ?, ?, ?, ?, ?)", (name, role, position, color, desc, note, active))

            await db.commit()

        try:
            await db.execute("ALTER TABLE auditLogs ADD COLUMN field TEXT DEFAULT ''")
            await db.commit()
        except Exception:
            pass

        for table in ['projects', 'tasks', 'changes']:
            for col_name in ['checklists', 'notes']:
                try:
                    await db.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} TEXT DEFAULT '[]'")
                    await db.commit()
                except Exception:
                    pass
    finally:
        await db.close()

    logger.info(f"Database initialized: {DB_PATH}")


def row_to_dict(table: str, row) -> Dict[str, Any]:
    """Convert a database row to a dictionary, parsing JSON columns."""
    d = dict(row)
    json_cols = JSON_COLUMNS.get(table, [])
    for col in json_cols:
        if col in d and d[col] is not None:
            try:
                d[col] = json.loads(d[col])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def serialize_json_fields(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize JSON-type fields to strings for storage."""
    json_cols = JSON_COLUMNS.get(table, [])
    result = dict(data)
    for col in json_cols:
        if col in result and result[col] is not None and not isinstance(result[col], str):
            result[col] = json.dumps(result[col], ensure_ascii=False)
    return result


def sanitize_data(table: str, data: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only allowed columns for the table."""
    allowed = set(TABLE_COLUMNS.get(table, []))
    return {k: v for k, v in data.items() if k in allowed}


# --- CORS Middleware ---
@web.middleware
async def cors_middleware(request, handler):
    if request.method == 'OPTIONS':
        response = web.Response(status=200)
    else:
        try:
            response = await handler(request)
        except web.HTTPException as ex:
            response = ex
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Client-ID'
    return response


# --- API Handlers ---

async def handle_get_all(request):
    """GET /api/all — Returns all data from all tables."""
    result = {}
    db = await get_db()
    try:
        for table in TABLES:
            if table == 'meta':
                continue
            cursor = await db.execute(f"SELECT * FROM {table}")
            rows = await cursor.fetchall()
            result[table] = [row_to_dict(table, row) for row in rows]
    finally:
        await db.close()
    return web.json_response(result)


async def handle_next_num(request):
    """GET /api/next-num/{entity} — Atomic calculation of next code (P-001, T-001, C-001)."""
    entity = request.match_info.get('entity')
    prefix_map = {
        'projects': 'P',
        'tasks': 'T',
        'changes': 'C'
    }
    prefix = prefix_map.get(entity, 'N')
    if entity not in prefix_map:
        raise web.HTTPNotFound(text="Unknown entity")

    db = await get_db()
    try:
        cursor = await db.execute(f"SELECT num FROM {entity}")
        rows = await cursor.fetchall()
        max_num = 0
        for r in rows:
            num_str = r['num'] or ''
            digits = re.findall(r'\d+', num_str)
            if digits:
                val = int(digits[-1])
                if val > max_num:
                    max_num = val
        next_num = f"{prefix}-{str(max_num + 1).zfill(3)}"
    finally:
        await db.close()

    return web.json_response({"num": next_num, "next": max_num + 1})


async def handle_snapshot_export(request):
    """GET /api/snapshot — Export full snapshot."""
    from datetime import datetime
    result = {
        "version": 1,
        "app": "ProjectsSPA",
        "exportDate": datetime.utcnow().isoformat() + "Z",
        "data": {}
    }
    db = await get_db()
    try:
        for table in TABLES:
            if table == 'meta':
                continue
            cursor = await db.execute(f"SELECT * FROM {table}")
            rows = await cursor.fetchall()
            result["data"][table] = [row_to_dict(table, row) for row in rows]
    finally:
        await db.close()
    return web.json_response(result)


async def handle_snapshot_import(request):
    """POST /api/snapshot — Import data snapshot."""
    client_id = request.headers.get('X-Client-ID')
    snapshot = await request.json()
    db = await get_db()
    try:
        tables_to_sync = [
            'projects', 'tasks', 'changes', 'employees', 'priorities',
            'taskStatuses', 'projectStatuses', 'stages', 'stageHistory', 'kanbanBoards',
            'formLayouts'
        ]
        for table in tables_to_sync:
            if table in snapshot:
                await db.execute(f"DELETE FROM {table}")
                items = snapshot[table]
                if isinstance(items, list):
                    for data in items:
                        if not isinstance(data, dict):
                            continue
                        clean = sanitize_data(table, data)
                        clean = serialize_json_fields(table, clean)
                        if not clean:
                            continue
                        cols = ", ".join(quote_col(k) for k in clean.keys())
                        placeholders = ", ".join("?" for _ in clean)
                        values = tuple(clean.values())
                        await db.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})", values)
        await db.commit()
    finally:
        await db.close()
    await notify_clients(client_id)
    return web.json_response({"success": True})


# --- Meta Endpoints ---

async def handle_meta_get(request):
    """GET /api/meta/{key} — Get meta value."""
    key = request.match_info['key']
    db = await get_db()
    try:
        cursor = await db.execute("SELECT key, value FROM meta WHERE key = ?", (key,))
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        return web.json_response(None)

    try:
        val = json.loads(row['value'])
    except (json.JSONDecodeError, TypeError):
        val = row['value']

    return web.json_response({"key": key, "value": val})


async def handle_meta_set(request):
    """PUT /api/meta/{key} — Set meta value."""
    key = request.match_info['key']
    body = await request.json()

    if isinstance(body, dict) and 'value' in body:
        val = body['value']
    else:
        val = body

    val_str = json.dumps(val, ensure_ascii=False)

    db = await get_db()
    try:
        await db.execute(
            "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, val_str)
        )
        await db.commit()
    finally:
        await db.close()

    return web.json_response({"success": True, "key": key})


async def handle_meta_list(request):
    """GET /api/meta — List all meta entries."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT key, value FROM meta")
        rows = await cursor.fetchall()
    finally:
        await db.close()

    result = []
    for row in rows:
        try:
            val = json.loads(row['value'])
        except:
            val = row['value']
        result.append({"key": row['key'], "value": val})
    return web.json_response(result)


async def handle_meta_clear(request):
    """DELETE /api/meta — Clear all meta."""
    db = await get_db()
    try:
        await db.execute("DELETE FROM meta")
        await db.commit()
    finally:
        await db.close()
    return web.json_response({"success": True})


async def handle_logs_list(request):
    """GET /api/logs — Get audit logs with optional filtering and limit."""
    limit = int(request.query.get('limit', 500))
    offset = int(request.query.get('offset', 0))
    action_filter = request.query.get('action')
    entity_filter = request.query.get('entity')
    ip_filter = request.query.get('ip')
    search = request.query.get('search', '').strip().lower()

    conditions = []
    params = []

    if action_filter:
        conditions.append("action = ?")
        params.append(action_filter)
    if entity_filter:
        conditions.append("entity = ?")
        params.append(entity_filter)
    if ip_filter:
        conditions.append("ip = ?")
        params.append(ip_filter)
    if search:
        conditions.append("(LOWER(target) LIKE ? OR LOWER(ip) LIKE ? OR LOWER(action) LIKE ? OR LOWER(entity) LIKE ?)")
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param, search_param])

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    db = await get_db()
    try:
        cursor = await db.execute(f"SELECT COUNT(*) as cnt FROM auditLogs {where_clause}", params)
        total_row = await cursor.fetchone()
        total = total_row['cnt'] if total_row else 0

        cursor = await db.execute(
            f"SELECT * FROM auditLogs {where_clause} ORDER BY id DESC LIMIT ? OFFSET ?",
            params + [limit, offset]
        )
        rows = await cursor.fetchall()
        logs = [row_to_dict('auditLogs', r) for r in rows]
    finally:
        await db.close()

    return web.json_response({"total": total, "logs": logs})


async def handle_logs_clear(request):
    """DELETE /api/logs — Clear audit logs."""
    ip = get_client_ip(request)
    ua = request.headers.get('User-Agent', '')
    db = await get_db()
    try:
        await db.execute("DELETE FROM auditLogs")
        await db.commit()
    finally:
        await db.close()

    await record_audit_log(ip, "clear_logs", "auditLogs", "Очистка журнала аудита", {}, ua)
    return web.json_response({"success": True})


# --- Generic CRUD Endpoints ---

async def handle_get_all_table(request):
    """GET /api/{table} — Get all records."""
    table = request.match_info['table']
    if table not in TABLES or table == 'meta':
        raise web.HTTPNotFound(text="Table not found")

    db = await get_db()
    try:
        cursor = await db.execute(f"SELECT * FROM {table}")
        rows = await cursor.fetchall()
    finally:
        await db.close()
    return web.json_response([row_to_dict(table, row) for row in rows])


async def handle_get_one(request):
    """GET /api/{table}/{id} — Get one record."""
    table = request.match_info['table']
    if table not in TABLES or table == 'meta':
        raise web.HTTPNotFound(text="Table not found")

    id_val = request.match_info['id']

    db = await get_db()
    try:
        cursor = await db.execute(f"SELECT * FROM {table} WHERE id = ?", (id_val,))
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise web.HTTPNotFound(text="Record not found")
    return web.json_response(row_to_dict(table, row))


async def handle_create(request):
    """POST /api/{table} — Create a record with validation and atomic numbering."""
    table = request.match_info['table']
    if table not in TABLES or table == 'meta':
        raise web.HTTPNotFound(text="Table not found")

    client_id = request.headers.get('X-Client-ID')
    raw_data = await request.json()
    data = sanitize_data(table, raw_data)

    # Auto-generate unique number if table has num column and num is missing or empty
    if table in ('projects', 'tasks', 'changes') and not data.get('num'):
        prefix = 'P' if table == 'projects' else ('T' if table == 'tasks' else 'C')
        db_temp = await get_db()
        try:
            cur = await db_temp.execute(f"SELECT num FROM {table}")
            rows = await cur.fetchall()
            max_num = 0
            for r in rows:
                digits = re.findall(r'\d+', r['num'] or '')
                if digits:
                    val = int(digits[-1])
                    if val > max_num:
                        max_num = val
            data['num'] = f"{prefix}-{str(max_num + 1).zfill(3)}"
        finally:
            await db_temp.close()

    data = serialize_json_fields(table, data)

    if not data:
        raise web.HTTPBadRequest(text="Empty data")

    cols = ", ".join(quote_col(k) for k in data.keys())
    placeholders = ", ".join("?" for _ in data)
    values = tuple(data.values())

    db = await get_db()
    try:
        cursor = await db.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})", values)
        await db.commit()
        last_id = cursor.lastrowid
        cursor = await db.execute(f"SELECT * FROM {table} WHERE id = ?", (last_id,))
        row = await cursor.fetchone()
    finally:
        await db.close()

    res_data = row_to_dict(table, row)
    target_name = str(res_data.get('num') or res_data.get('name') or f"ID {last_id}")
    ip = get_client_ip(request)
    ua = request.headers.get('User-Agent', '')
    if table != 'auditLogs':
        await record_audit_log(ip, "create", table, target_name, {"created": res_data}, ua, field="— (Новая запись)")

    await notify_clients(client_id)
    return web.json_response(res_data, status=201)


async def handle_update(request):
    """PUT /api/{table}/{id} — Update a record."""
    table = request.match_info['table']
    if table not in TABLES or table == 'meta':
        raise web.HTTPNotFound(text="Table not found")

    client_id = request.headers.get('X-Client-ID')
    id_val = request.match_info['id']
    raw_data = await request.json()
    data = sanitize_data(table, raw_data)
    data = serialize_json_fields(table, data)

    if not data:
        raise web.HTTPBadRequest(text="Empty data")

    set_clause = ", ".join(f'{quote_col(k)} = ?' for k in data.keys())
    values = tuple(data.values()) + (id_val,)

    db = await get_db()
    old_dict = None
    try:
        # Fetch old record to compute diff
        cursor = await db.execute(f"SELECT * FROM {table} WHERE id = ?", (id_val,))
        old_row = await cursor.fetchone()
        if old_row:
            old_dict = row_to_dict(table, old_row)

        await db.execute(f"UPDATE {table} SET {set_clause} WHERE id = ?", values)
        await db.commit()
        cursor = await db.execute(f"SELECT * FROM {table} WHERE id = ?", (id_val,))
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise web.HTTPNotFound(text="Record not found after update")

    new_dict = row_to_dict(table, row)
    target_name = str(new_dict.get('num') or new_dict.get('name') or f"ID {id_val}")
    ip = get_client_ip(request)
    ua = request.headers.get('User-Agent', '')

    if table != 'auditLogs':
        # Compute field level diff: { field: { from: ..., to: ... } }
        diffs = {}
        if old_dict:
            for k, n_val in new_dict.items():
                if k in ('updatedAt', 'createdAt'):
                    continue
                o_val = old_dict.get(k)
                if o_val != n_val:
                    diffs[k] = {"from": o_val, "to": n_val}

        if diffs:
            field_labels = {
                'name': 'Название', 'num': 'Номер / Код', 'statusId': 'Статус',
                'priorityId': 'Приоритет', 'stageId': 'Этап', 'customerId': 'Заказчик',
                'devId': 'Разработчик', 'agentId': 'Агент', 'projectId': 'Проект',
                'taskId': 'Задача', 'start': 'Дата начала', 'end': 'Дата окончания',
                'desc': 'Описание', 'note': 'Примечание', 'stageProgress': 'Прогресс этапов',
                'agents': 'Участники-агенты', 'devs': 'Участники-разработчики',
                'extNum': 'Внешний №', 'extLink': 'Внешняя ссылка', 'role': 'Роль',
                'position': 'Должность', 'contacts': 'Контакты', 'color': 'Цвет',
                'weight': 'Вес', 'order': 'Порядок', 'active': 'Активность'
            }
            changed_fields = ", ".join(field_labels.get(k, k) for k in diffs.keys())
            await record_audit_log(ip, "update", table, target_name, {"changes": diffs}, ua, field=changed_fields)

    await notify_clients(client_id)
    return web.json_response(new_dict)


async def handle_delete_one(request):
    """DELETE /api/{table}/{id} — Delete one record."""
    table = request.match_info['table']
    if table not in TABLES or table == 'meta':
        raise web.HTTPNotFound(text="Table not found")

    client_id = request.headers.get('X-Client-ID')
    id_val = request.match_info['id']

    db = await get_db()
    old_dict = None
    try:
        cursor = await db.execute(f"SELECT * FROM {table} WHERE id = ?", (id_val,))
        old_row = await cursor.fetchone()
        if old_row:
            old_dict = row_to_dict(table, old_row)

        await db.execute(f"DELETE FROM {table} WHERE id = ?", (id_val,))
        await db.commit()
    finally:
        await db.close()

    target_name = str((old_dict and (old_dict.get('num') or old_dict.get('name'))) or f"ID {id_val}")
    ip = get_client_ip(request)
    ua = request.headers.get('User-Agent', '')
    if table != 'auditLogs':
        await record_audit_log(ip, "delete", table, target_name, {"deleted": old_dict or {"id": id_val}}, ua, field="— (Удаление)")

    await notify_clients(client_id)
    return web.json_response({"success": True})


async def handle_clear_table(request):
    """DELETE /api/{table} — Clear all records."""
    table = request.match_info['table']
    if table not in TABLES or table == 'meta':
        raise web.HTTPNotFound(text="Table not found")

    client_id = request.headers.get('X-Client-ID')

    db = await get_db()
    try:
        await db.execute(f"DELETE FROM {table}")
        await db.commit()
    finally:
        await db.close()

    ip = get_client_ip(request)
    ua = request.headers.get('User-Agent', '')
    if table != 'auditLogs':
        await record_audit_log(ip, "clear_table", table, f"Очистка таблицы {table}", {}, ua, field="Все поля")

    await notify_clients(client_id)
    return web.json_response({"success": True})


async def handle_bulk(request):
    """POST /api/{table}/bulk — Bulk insert records."""
    table = request.match_info['table']
    if table not in TABLES or table == 'meta':
        raise web.HTTPNotFound(text="Table not found")

    client_id = request.headers.get('X-Client-ID')
    items = await request.json()
    if not isinstance(items, list):
        raise web.HTTPBadRequest(text="Expected list of objects")

    db = await get_db()
    try:
        for raw_item in items:
            if not isinstance(raw_item, dict):
                continue
            clean = sanitize_data(table, raw_item)
            clean = serialize_json_fields(table, clean)
            if not clean:
                continue
            cols = ", ".join(quote_col(k) for k in clean.keys())
            placeholders = ", ".join("?" for _ in clean)
            values = tuple(clean.values())
            await db.execute(f"INSERT INTO {table} ({cols}) VALUES ({placeholders})", values)
        await db.commit()
    finally:
        await db.close()

    ip = get_client_ip(request)
    ua = request.headers.get('User-Agent', '')
    if table != 'auditLogs':
        await record_audit_log(ip, "bulk_insert", table, f"Массовое добавление {len(items)} записей", {"count": len(items)}, ua, field="Массово")

    await notify_clients(client_id)
    return web.json_response({"success": True, "count": len(items)}, status=201)


# --- DB Inspector Endpoints ---

async def handle_db_schema(request):
    """GET /api/db/schema — Return database schema with tables, columns, and row counts."""
    db = await get_db()
    try:
        cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        table_rows = await cursor.fetchall()
        tables_info = []

        for row in table_rows:
            tname = row[0]
            col_cursor = await db.execute(f'PRAGMA table_info("{tname}")')
            col_rows = await col_cursor.fetchall()
            columns = [
                {
                    "cid": c[0],
                    "name": c[1],
                    "type": c[2],
                    "notnull": bool(c[3]),
                    "dflt_value": c[4],
                    "pk": bool(c[5])
                }
                for c in col_rows
            ]
            cnt_cursor = await db.execute(f'SELECT COUNT(*) FROM "{tname}"')
            cnt_row = await cnt_cursor.fetchone()
            row_count = cnt_row[0] if cnt_row else 0

            tables_info.append({
                "name": tname,
                "columns": columns,
                "rowCount": row_count
            })

        return web.json_response({"success": True, "tables": tables_info, "dbPath": DB_PATH})
    finally:
        await db.close()


async def handle_sql_execute(request):
    """POST /api/sql/execute — Execute arbitrary raw SQL query for DB Inspector."""
    data = await request.json()
    sql = (data.get('sql') or '').strip()
    client_id = request.headers.get('X-Client-ID')
    ip = get_client_ip(request)
    ua = request.headers.get("User-Agent", "")

    if not sql:
        raise web.HTTPBadRequest(text="Missing 'sql' in request body")

    db = await get_db()
    try:
        trimmed_sql = sql.rstrip(';').strip()
        first_word = trimmed_sql.split()[0].upper() if trimmed_sql else ''

        if first_word in ('SELECT', 'PRAGMA', 'EXPLAIN'):
            cursor = await db.execute(sql)
            rows = await cursor.fetchall()
            columns = [d[0] for d in cursor.description] if cursor.description else []
            data_rows = []
            for r in rows:
                row_dict = {}
                for idx, col in enumerate(columns):
                    row_dict[col] = r[idx]
                data_rows.append(row_dict)
            return web.json_response({
                "success": True,
                "type": "read",
                "columns": columns,
                "rows": data_rows,
                "count": len(data_rows)
            })
        else:
            # Write operations
            cursor = await db.execute(sql)
            await db.commit()
            rows_affected = cursor.rowcount
            last_insert_id = cursor.lastrowid

            await record_audit_log(
                ip=ip,
                action='sql_execute',
                entity='db',
                target=first_word,
                field='sql',
                details={'sql': sql, 'rowsAffected': rows_affected},
                user_agent=ua
            )

            await notify_clients(client_id)
            return web.json_response({
                "success": True,
                "type": "write",
                "rowsAffected": rows_affected,
                "lastInsertId": last_insert_id
            })
    except Exception as e:
        logger.error(f"SQL Execute Error: {e}")
        return web.json_response({"success": False, "error": str(e)}, status=400)
    finally:
        await db.close()


# --- Static File Serving ---

async def index_handler(request):
    """Serve index.html."""
    index_path = os.path.join(BASE_DIR, 'index.html')
    if os.path.exists(index_path):
        return web.FileResponse(index_path)
    return web.Response(
        text="<h1>Projects SPA Server</h1><p>index.html not found.</p>",
        content_type='text/html'
    )


async def static_fallback(request):
    """Serve static files or fall back to index.html for SPA routes."""
    tail = request.match_info.get('tail', '')
    full_path = os.path.join(BASE_DIR, tail.replace('/', os.sep))

    # Security: prevent path traversal
    real_path = os.path.realpath(full_path)
    real_base = os.path.realpath(BASE_DIR)
    if not real_path.startswith(real_base):
        raise web.HTTPForbidden()

    if os.path.isfile(real_path):
        return web.FileResponse(real_path)
    return await index_handler(request)


def setup_routes(app):
    """Register all API and static routes."""
    # WebSocket
    app.router.add_get('/ws', handle_ws)

    # Server & Snapshot endpoints
    app.router.add_get('/api/server-info', handle_server_info)
    app.router.add_post('/api/db-config', handle_set_db_config)
    app.router.add_get('/api/next-num/{entity}', handle_next_num)
    app.router.add_get('/api/all', handle_get_all)
    app.router.add_get('/api/snapshot', handle_snapshot_export)
    app.router.add_post('/api/snapshot', handle_snapshot_import)

    # DB Inspector endpoints
    app.router.add_get('/api/db/schema', handle_db_schema)
    app.router.add_post('/api/sql/execute', handle_sql_execute)

    # Audit Logs endpoints
    app.router.add_get('/api/logs', handle_logs_list)
    app.router.add_delete('/api/logs', handle_logs_clear)

    # Meta endpoints (must be before generic /{table})
    app.router.add_get('/api/meta', handle_meta_list)
    app.router.add_delete('/api/meta', handle_meta_clear)
    app.router.add_get('/api/meta/{key}', handle_meta_get)
    app.router.add_put('/api/meta/{key}', handle_meta_set)

    # Generic table CRUD
    app.router.add_get('/api/{table}', handle_get_all_table)
    app.router.add_post('/api/{table}', handle_create)
    app.router.add_delete('/api/{table}', handle_clear_table)
    app.router.add_post('/api/{table}/bulk', handle_bulk)
    app.router.add_get('/api/{table}/{id}', handle_get_one)
    app.router.add_put('/api/{table}/{id}', handle_update)
    app.router.add_delete('/api/{table}/{id}', handle_delete_one)

    # Static files and SPA fallback
    app.router.add_get('/', index_handler)
    app.router.add_get('/{tail:.*}', static_fallback)


async def handle_server_info(request):
    """GET /api/server-info — Return server IPs, port, and DB info."""
    ips = get_local_ips()
    urls = [f"http://127.0.0.1:{PORT}"] + [f"http://{ip}:{PORT}" for ip in ips if ip != "127.0.0.1"]
    return web.json_response({
        "port": PORT,
        "ips": ips,
        "urls": urls,
        "localhost": f"http://127.0.0.1:{PORT}",
        "db": DB_PATH,
        "default_db": os.path.join(DB_DIR, "projects.db")
    })


async def handle_set_db_config(request):
    """POST /api/db-config — Switch or set custom database file path."""
    global DB_PATH
    client_id = request.headers.get('X-Client-ID')
    data = await request.json()
    new_path = (data.get('db_path') or '').strip()

    if not new_path:
        new_path = os.path.join(DB_DIR, "projects.db")

    if not os.path.isabs(new_path):
        new_path = os.path.abspath(os.path.join(DB_DIR, new_path))

    # Ensure parent folder exists
    parent_dir = os.path.dirname(new_path)
    if parent_dir and not os.path.exists(parent_dir):
        try:
            os.makedirs(parent_dir, exist_ok=True)
        except Exception as e:
            raise web.HTTPBadRequest(text=f"Cannot create directory: {e}")

    DB_PATH = new_path
    save_db_path(DB_PATH)
    logger.info(f"Database switched to: {DB_PATH}")

    # Initialize new database schema if file is fresh
    try:
        await init_db()
    except Exception as e:
        logger.error(f"Error initializing DB at {DB_PATH}: {e}")
        raise web.HTTPInternalServerError(text=f"Failed to initialize database: {e}")

    # Notify all clients that data source has changed
    await notify_clients(client_id)

    return web.json_response({
        "success": True,
        "db": DB_PATH
    })


_CACHED_IPS = None

def get_local_ips():
    """Detect all local network IP addresses (fast, cached, non-blocking)."""
    global _CACHED_IPS
    if _CACHED_IPS is not None:
        return _CACHED_IPS

    import socket
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.05)
        try:
            s.connect(('1.1.1.1', 80))
            local_ip = s.getsockname()[0]
            if local_ip and not local_ip.startswith('127.'):
                ips.append(local_ip)
        except Exception:
            pass
        finally:
            s.close()
    except Exception:
        pass

    _CACHED_IPS = ips
    return ips


async def main():
    """Start the server."""
    logger.info(f"Database path: {DB_PATH}")
    await init_db()

    app = web.Application(middlewares=[cors_middleware])
    setup_routes(app)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, HOST, PORT)
    await site.start()

    local_ips = get_local_ips()

    print()
    print("=" * 60)
    print("  Projects SPA — Сервер запущен")
    print("=" * 60)
    print()
    print(f"  Этот компьютер:  http://127.0.0.1:{PORT}")
    print()
    if local_ips:
        print("  Для других пользователей по сети:")
        for ip in local_ips:
            print(f"    →  http://{ip}:{PORT}")
    else:
        print("  Сетевые адреса не обнаружены")
    print()
    print(f"  База данных:  {DB_PATH}")
    print()
    print("-" * 60)
    print("  Не закрывайте это окно — сервер работает.")
    print("  Нажмите Ctrl+C для остановки.")
    print("-" * 60)
    print()

    # Start fast non-blocking browser open in background thread once server socket responds
    def open_browser():
        import time
        import socket
        # Wait up to 3 seconds for port to actively accept connections
        for _ in range(30):
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.1)
                res = sock.connect_ex(('127.0.0.1', PORT))
                sock.close()
                if res == 0:
                    break
            except Exception:
                pass
            time.sleep(0.08)

        try:
            webbrowser.open(f"http://127.0.0.1:{PORT}")
        except Exception as e:
            logger.warning(f"Не удалось открыть браузер: {e}")

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    # Keep running
    await asyncio.Event().wait()


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nСервер остановлен.")

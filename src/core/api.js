// src/core/api.js
// REST API client — replaces Dexie.js for server-backed SQLite

const BASE = '/api';

// Unique client instance identifier to avoid echo-reload loops
export const CLIENT_ID = 'cli_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Client-ID': CLIENT_ID
    }
  };
  if (body !== null && body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${path} → ${res.status}: ${text}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

/**
 * Get next atomic sequence number from server (e.g. P-001, T-001, C-001)
 */
export async function getNextNum(entity) {
  try {
    const res = await request('GET', `/next-num/${entity}`);
    return res?.num || '';
  } catch (e) {
    return '';
  }
}

/**
 * Generic table operations
 */
function table(name) {
  return {
    async toArray() {
      return request('GET', `/${name}`);
    },
    async get(id) {
      return request('GET', `/${name}/${id}`);
    },
    async add(record) {
      const result = await request('POST', `/${name}`, record);
      return result.id;
    },
    async put(record) {
      if (record.id != null) {
        const result = await request('PUT', `/${name}/${record.id}`, record);
        return result.id;
      }
      // If no id, create new
      const result = await request('POST', `/${name}`, record);
      return result.id;
    },
    async delete(id) {
      return request('DELETE', `/${name}/${id}`);
    },
    async clear() {
      return request('DELETE', `/${name}`);
    },
    async bulkAdd(records) {
      return request('POST', `/${name}/bulk`, records);
    }
  };
}

/**
 * Meta table operations (key-value store)
 */
const metaOps = {
  async get(key) {
    try {
      const result = await request('GET', `/meta/${key}`);
      return result;
    } catch (e) {
      return null;
    }
  },
  async put(record) {
    const key = record.key || record.id;
    return request('PUT', `/meta/${key}`, record);
  },
  async clear() {
    return request('DELETE', `/meta`);
  },
  async toArray() {
    return request('GET', `/meta`);
  },
  async bulkAdd(records) {
    return request('POST', `/meta/bulk`, records);
  }
};

/**
 * Database proxy — drop-in replacement for Dexie `db` object
 */
export const db = {
  projects: table('projects'),
  tasks: table('tasks'),
  changes: table('changes'),
  employees: table('employees'),
  customers: table('customers'),
  priorities: table('priorities'),
  taskStatuses: table('taskStatuses'),
  projectStatuses: table('projectStatuses'),
  stages: table('stages'),
  stageHistory: table('stageHistory'),
  kanbanBoards: table('kanbanBoards'),
  auditLogs: table('auditLogs'),
  formLayouts: table('formLayouts'),
  meta: metaOps,
  async getLogs(params = {}) {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', params.limit);
    if (params.offset) qs.set('offset', params.offset);
    if (params.action) qs.set('action', params.action);
    if (params.entity) qs.set('entity', params.entity);
    if (params.ip) qs.set('ip', params.ip);
    if (params.search) qs.set('search', params.search);
    const qStr = qs.toString() ? `?${qs.toString()}` : '';
    return request('GET', `/logs${qStr}`);
  },
  async clearLogs() {
    return request('DELETE', `/logs`);
  }
};

/**
 * Refresh all data from the server in one request
 */
export async function refreshAll(S) {
  const data = await request('GET', '/all');
  Object.assign(S, {
    projects: data.projects || [],
    tasks: data.tasks || [],
    changes: data.changes || [],
    employees: data.employees || [],
    customers: data.customers || [],
    priorities: data.priorities || [],
    taskStatuses: data.taskStatuses || [],
    projectStatuses: data.projectStatuses || [],
    stages: data.stages || [],
    stageHistory: data.stageHistory || [],
    history: data.stageHistory || [],
    kanbanBoards: data.kanbanBoards || [],
    formLayouts: data.formLayouts || [],
    auditLogs: data.auditLogs || []
  });
}

/**
 * Build snapshot for export
 */
export async function getSnapshot() {
  return request('GET', '/snapshot');
}

/**
 * Import snapshot
 */
export async function importSnapshot(data) {
  return request('POST', '/snapshot', data);
}

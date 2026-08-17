// src/core/db.js
// Re-exports from api.js for backward compatibility
// All database operations now go through the REST API → SQLite backend
export { db, refreshAll } from './api.js';

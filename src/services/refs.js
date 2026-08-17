// src/services/refs.js
export const emp = (S, id) => S.employees.find(e => e.id === id);
export const cust = (S, id) => (S.customers || []).find(c => c.id === id);
export const pri = (S, id) => S.priorities.find(p => p.id === id);
export const stg = (S, id) => S.stages.find(s => s.id === id);
export const statFor = (S, ent, id) => (ent === 'projects' ? S.projectStatuses : S.taskStatuses).find(s => s.id === id);
export const prj = (S, id) => S.projects.find(p => p.id === id);
export const tsk = (S, id) => S.tasks.find(t => t.id === id);

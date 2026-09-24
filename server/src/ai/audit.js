import { AuditLog } from '../models/AuditLog.js'

/** Records an important AI decision or action. Never throws: auditing must not break the workflow. */
export async function audit(projectId, entry) {
  try {
    await AuditLog.create({ project: projectId, ...entry })
  } catch (err) {
    console.error('Audit log write failed:', err.message)
  }
}

/** Minimal snapshot of an entity for previous/new state fields. */
export const snapshot = (item, fields) => Object.fromEntries(fields.map((f) => [f, item?.[f] ?? null]))

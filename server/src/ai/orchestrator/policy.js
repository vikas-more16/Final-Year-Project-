import { AI_ACTIONS } from '../../config/constants.js'
import { PendingAction } from '../../models/PendingAction.js'
import { audit } from '../audit.js'

/** 'auto' or 'approval' for an action, honouring the manager's per-project settings. */
export const policyFor = (memory, action) => memory.approvals?.[action] ?? AI_ACTIONS[action]?.default ?? 'approval'

/** Parks an impactful change for the manager. Identical pending proposals are not duplicated. */
export async function propose(projectId, { action, title, summary, reason, payload, proposedBy, dedupeKey }) {
  if (dedupeKey) {
    const existing = await PendingAction.findOne({ project: projectId, action, status: 'pending', 'payload.dedupeKey': dedupeKey })
    if (existing) return existing
  }
  const pending = await PendingAction.create({
    project: projectId, action, title, summary, reason, proposedBy, payload: { ...payload, dedupeKey },
  })
  await audit(projectId, {
    agent: proposedBy, action: 'request_approval', decision: title, reason,
    entityType: 'PendingAction', entityId: pending._id, newState: { action, status: 'pending' },
  })
  return pending
}

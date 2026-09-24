import mongoose from 'mongoose'
import { AI_ACTIONS } from '../config/constants.js'
import { AgentRun } from '../models/AgentRun.js'
import { AuditLog } from '../models/AuditLog.js'
import { PendingAction } from '../models/PendingAction.js'
import { Project } from '../models/Project.js'
import { listAgents } from '../ai/agents/registry.js'
import { audit } from '../ai/audit.js'
import { llmConfigured, llmModels } from '../ai/llm.js'
import { getMemory } from '../ai/memory/projectMemory.js'
import {
  answerClarification, decideApproval, handlePrompt, requestPlanning, requestReconcile,
} from '../ai/orchestrator/index.js'
import { policyFor } from '../ai/orchestrator/policy.js'
import { HttpError } from '../utils/HttpError.js'

/** Every AI route is scoped to a project the signed-in manager owns. */
export async function loadOwnedProject(req, _res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return next(new HttpError(404, 'Project not found'))
  const project = await Project.findOne({ _id: req.params.id, owner: req.user._id })
  if (!project) return next(new HttpError(404, 'Project not found'))
  req.project = project
  next()
}

export async function getAiState(req, res) {
  const projectId = req.project._id
  const [memory, runs, pending] = await Promise.all([
    getMemory(projectId),
    AgentRun.find({ project: projectId }).sort({ createdAt: -1 }).limit(15).lean(),
    PendingAction.find({ project: projectId, status: 'pending' }).sort({ createdAt: -1 }).lean(),
  ])
  res.json({
    configured: llmConfigured,
    models: llmModels,
    agents: listAgents(),
    busy: runs.some((r) => r.status === 'running' || r.status === 'queued'),
    runs,
    pending: pending.map(({ payload, ...p }) => ({ ...p, payload: payload?.proposal ? { epics: payload.proposal.epics.map((e) => ({ name: e.name, stories: e.stories.length, tasks: e.stories.reduce((n, s) => n + s.tasks.length, 0) })) } : payload })),
    memory: {
      info: memory.info,
      brd: {
        analyzedAt: memory.brd.analyzedAt,
        textChars: memory.brd.textChars,
        requirements: memory.brd.requirements,
        userRoles: memory.brd.userRoles,
        workflows: memory.brd.workflows,
      },
      prompts: memory.userContext.prompts.slice(-40),
      instructions: memory.userContext.instructions,
      clarifications: memory.userContext.clarifications.map((c, index) => ({ ...c.toObject(), index })),
      decisions: memory.decisions.slice(-20),
      planning: memory.planning,
    },
    approvals: Object.entries(AI_ACTIONS).map(([action, { label }]) => ({ action, label, mode: policyFor(memory, action) })),
  })
}

export async function startPlanning(req, res) {
  if (!req.project.brd?.fileId) throw new HttpError(400, 'Upload a BRD before planning this project.')
  requestPlanning(req.project._id, 'PLAN_REQUESTED')
  res.status(202).json({ message: 'Planning started' })
}

export async function sendPrompt(req, res) {
  const text = String(req.body.text ?? '').trim()
  if (text.length < 2) throw new HttpError(422, 'Write a message for the Orchestrator')
  if (text.length > 4000) throw new HttpError(422, 'Keep messages under 4000 characters')
  handlePrompt(req.project._id, text)
  res.status(202).json({ message: 'Received' })
}

export async function postClarification(req, res) {
  const answer = String(req.body.answer ?? '').trim()
  if (!answer) throw new HttpError(422, 'Write an answer')
  await answerClarification(req.project._id, Number(req.params.index), answer)
  res.json({ message: 'Answer recorded' })
}

export async function postApproval(req, res) {
  const { decision } = req.body
  if (!['approve', 'reject'].includes(decision)) throw new HttpError(422, 'Decision must be approve or reject')
  if (!mongoose.isValidObjectId(req.params.actionId)) throw new HttpError(404, 'Approval request not found')
  const pending = await decideApproval(req.project._id, req.params.actionId, decision)
  res.json({ pending })
}

const isoDate = (v) => (v === null || v === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : undefined)

/** Manager's own changes (they are the human in the loop, so these apply without approval). */
export async function updateSettings(req, res) {
  const memory = await getMemory(req.project._id)
  const { approvals, sprintLengthDays, startDate, deadline } = req.body
  const before = { deadline: memory.info.deadline ?? null, startDate: memory.info.startDate ?? null, sprintLengthDays: memory.planning.sprintLengthDays }
  let replan = false

  if (approvals) {
    const next = { ...memory.approvals }
    for (const [action, mode] of Object.entries(approvals)) {
      if (!AI_ACTIONS[action] || !['auto', 'approval'].includes(mode)) throw new HttpError(422, `Invalid approval setting: ${action}`)
      next[action] = mode
    }
    memory.approvals = next
    memory.markModified('approvals')
  }
  if (sprintLengthDays !== undefined) {
    const n = Number(sprintLengthDays)
    if (!Number.isInteger(n) || n < 5 || n > 30) throw new HttpError(422, 'Sprint length must be 5–30 days')
    replan ||= n !== memory.planning.sprintLengthDays
    memory.planning.sprintLengthDays = n
  }
  for (const [field, value] of [['startDate', startDate], ['deadline', deadline]]) {
    if (value === undefined) continue
    const date = isoDate(value)
    if (date === undefined) throw new HttpError(422, `${field} must be a date (YYYY-MM-DD)`)
    replan = true
    memory.info[field] = date ?? undefined
  }
  if (memory.info.deadline && memory.info.startDate && memory.info.deadline < memory.info.startDate) {
    throw new HttpError(422, 'The deadline must be after the start date')
  }
  await memory.save()
  await audit(req.project._id, {
    agent: 'manager', action: 'update_ai_settings', entityType: 'ProjectMemory', entityId: memory._id,
    decision: 'Updated AI and schedule settings', reason: 'Changed by the manager.', previousState: before,
    newState: { deadline: memory.info.deadline ?? null, startDate: memory.info.startDate ?? null, sprintLengthDays: memory.planning.sprintLengthDays },
  })
  if (replan) requestReconcile(req.project._id, 'SETTINGS_CHANGED', 'Schedule settings changed')
  res.json({ message: 'Settings saved' })
}

export async function listAudit(req, res) {
  const limit = Math.min(Number(req.query.limit) || 100, 300)
  const filter = { project: req.project._id }
  if (req.query.entity) filter.entityKey = String(req.query.entity)
  if (req.query.before) filter.at = { $lt: new Date(req.query.before) }
  const entries = await AuditLog.find(filter).sort({ at: -1 }).limit(limit).lean()
  res.json({ entries })
}

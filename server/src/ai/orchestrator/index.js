import { PendingAction } from '../../models/PendingAction.js'
import { WorkItem } from '../../models/WorkItem.js'
import { HttpError } from '../../utils/HttpError.js'
import { getAgent } from '../agents/registry.js'
import { audit } from '../audit.js'
import { llmConfigured } from '../llm.js'
import { getMemory, loadContext } from '../memory/projectMemory.js'
import { applyProposal, planProject } from './plan.js'
import { policyFor, propose } from './policy.js'
import { reconcile } from './reconcile.js'
import { enqueue, recoverStaleRuns, startRun } from './runs.js'

/**
 * Orchestrator: the single entry point for project events. It decides which agent handles what,
 * runs one workflow per project at a time, validates results, updates memory and triggers follow-ups.
 *
 * Events: BRD_UPLOADED, PLAN_REQUESTED, USER_PROMPT, TASK_STATUS_CHANGED, MEMBER_CHANGED,
 *         APPROVAL_DECIDED, CLARIFICATION_ANSWERED, SETTINGS_CHANGED
 */

const ACTIVE_STATUSES = new Set(['in_progress', 'in_review', 'done'])

/**
 * Runs a tracked job in the project's queue. Resolves with the run document once it finishes and
 * never rejects: callers fire these in the background, so failures are recorded, not thrown.
 */
function runJob(projectId, { agent, action, trigger, dedupeKey }, work) {
  return enqueue(projectId, dedupeKey, async () => {
    const runCtx = await startRun(projectId, { agent, action, trigger })
    try {
      const { status = 'succeeded', summary } = (await work(runCtx)) ?? {}
      await runCtx.finish(status, summary)
    } catch (err) {
      console.error(`[orchestrator] ${action} failed for project ${projectId}:`, err)
      await runCtx.fail(err)
      const memory = await getMemory(projectId)
      if (memory.planning.status === 'running') {
        memory.planning.status = 'failed'
        await memory.save()
      }
      await audit(projectId, { agent, action: `${action}_failed`, run: runCtx.run._id, decision: 'Run failed', reason: err.message })
    }
    return runCtx.run
  }).catch((err) => {
    console.error(`[orchestrator] could not run ${action} for project ${projectId}:`, err)
    return null
  })
}

async function planAndReconcile(projectId, runCtx) {
  const planned = await planProject(projectId, runCtx)
  if (planned.status !== 'succeeded' || planned.changed === false) return planned
  await runCtx.step('Scheduling sprints, deadlines and assignments')
  const r = await reconcile(projectId, { runId: runCtx.run._id, agent: 'orchestrator', reason: 'New work was planned' })
  const parts = [planned.summary, `${r.assigned} task(s) assigned`, `${r.sprints} sprint(s) planned`]
  if (r.vacantRoles.length) parts.push(`vacant roles: ${r.vacantRoles.join(', ')}`)
  if (r.emailed) parts.push(`${r.emailed} assignment email(s) queued`)
  if (r.risk) parts.push(`schedule risk: ${r.risk.differenceDays} day(s) late`)
  return { status: 'succeeded', summary: `${parts.join('; ')}.` }
}

// ---------------- Event handlers ----------------

/** BRD uploaded or replaced, or the manager pressed "Plan with AI". Returns the queued run promise. */
export function requestPlanning(projectId, trigger = 'PLAN_REQUESTED') {
  if (!llmConfigured) throw new HttpError(503, 'AI agents are not configured on the server (LLM_API_KEY is missing).')
  return runJob(projectId, { agent: 'planning', action: 'plan_project', trigger, dedupeKey: 'plan' }, (runCtx) => planAndReconcile(projectId, runCtx))
}

export function requestReconcile(projectId, trigger, reason) {
  return runJob(projectId, { agent: 'orchestrator', action: 'reconcile', trigger, dedupeKey: 'reconcile' }, async (runCtx) => {
    const r = await reconcile(projectId, { runId: runCtx.run._id, reason })
    const parts = [`${r.assigned} task(s) assigned`, `${r.sprints} sprint(s)`]
    if (r.unblocked.length) parts.push(`now actionable: ${r.unblocked.join(', ')}`)
    if (r.vacantRoles.length) parts.push(`vacant roles: ${r.vacantRoles.join(', ')}`)
    return { summary: `${parts.join('; ')}.` }
  })
}

/** A team member joined, left, changed availability/skills/projects: re-run assignment where it matters. */
export async function memberChanged(member, previousProjectIds = []) {
  try {
    // `projects` may be populated documents or plain ids.
    const ids = [...(member.projects ?? []), ...previousProjectIds].map((p) => String(p?._id ?? p))
    for (const projectId of new Set(ids)) {
      const hasPlan = await WorkItem.exists({ project: projectId, type: 'task' })
      if (hasPlan) requestReconcile(projectId, 'MEMBER_CHANGED', `Team member ${member.name} changed`)
    }
  } catch (err) {
    console.error('[orchestrator] memberChanged failed:', err)
  }
}

/**
 * Manager moved a task (or subtask) to a new status. Validated and applied synchronously so the board
 * gets an immediate answer, then the project is reconciled (unblocking and assigning the next work).
 */
export function updateStatus(projectId, key, { status, acceptanceVerified }) {
  return enqueue(projectId, null, async () => {
    const item = await WorkItem.findOne({ project: projectId, key })
    if (!item) throw new HttpError(404, 'Work item not found')
    if (item.type !== 'task' && item.type !== 'subtask') {
      throw new HttpError(400, 'Epic and story status follows their tasks automatically')
    }
    if (item.status === status) return { item, unblocked: [] }
    if (ACTIVE_STATUSES.has(status) && item.blockedBy.length) {
      const blockers = await WorkItem.find({ _id: { $in: item.blockedBy } }).select('key')
      throw new HttpError(409, `${item.key} is blocked by ${blockers.map((b) => b.key).join(', ')}. Finish those first.`)
    }
    if (status === 'done' && item.type === 'task' && item.acceptanceCriteria.length && !acceptanceVerified) {
      throw new HttpError(422, 'Confirm the acceptance criteria are met before marking the task done.')
    }

    const previous = item.status
    item.status = status
    if (status === 'in_progress' && !item.startedAt) item.startedAt = new Date()
    if (status === 'done') {
      item.completedAt = new Date()
      if (item.type === 'task') {
        item.acceptanceVerifiedAt = new Date()
        item.acceptanceCriteria.forEach((c) => { c.met = true })
        await WorkItem.updateMany({ parent: item._id, type: 'subtask', status: { $ne: 'done' } }, { $set: { status: 'done', completedAt: new Date() } })
      }
    } else {
      item.completedAt = undefined
      if (previous === 'done') {
        // Reopened work must be verified again before it can be closed.
        item.acceptanceVerifiedAt = undefined
        item.acceptanceCriteria.forEach((c) => { c.met = false })
      }
    }
    await item.save()
    await audit(projectId, {
      agent: 'manager', action: 'update_status', entityType: 'WorkItem', entityId: item._id, entityKey: item.key,
      decision: `${item.key} moved from ${previous} to ${status}`,
      reason: status === 'done' && item.type === 'task' ? 'Acceptance criteria verified by the manager.' : 'Updated on the board.',
      previousState: { status: previous }, newState: { status },
    })

    const r = await reconcile(projectId, { agent: 'orchestrator', reason: `${item.key} is now ${status}` })
    return { item, unblocked: r.unblocked, assigned: r.assigned }
  })
}

// ---------------- Conversation ----------------

function stateFacts(context) {
  const tasks = context.items.filter((i) => i.type === 'task')
  const by = (s) => tasks.filter((t) => t.status === s).length
  const blocked = tasks.filter((t) => t.blockedBy.length && t.status !== 'done')
  const keyOf = new Map(context.items.map((i) => [String(i._id), i.key]))
  const vacant = tasks.filter((t) => t.assignment?.state === 'pending' && t.status !== 'done')
  const team = new Map(context.team.map((m) => [String(m._id), m.name]))
  const upcoming = tasks.filter((t) => t.status !== 'done').sort((a, b) => a.dueDate - b.dueDate).slice(0, 12)
  const risk = context.memory.planning.scheduleRisk
  return [
    `Tasks: ${tasks.length} total, ${by('todo')} to do, ${by('in_progress')} in progress, ${by('in_review')} in review, ${by('done')} done.`,
    `Blocked (${blocked.length}): ${blocked.slice(0, 25).map((t) => `${t.key} "${t.title}" waits for ${t.blockedBy.map((b) => keyOf.get(String(b))).join(', ')}`).join('; ') || 'none'}.`,
    `Actionable now (not blocked, not done): ${tasks.filter((t) => !t.blockedBy.length && t.status !== 'done').map((t) => t.key).join(', ') || 'none'}.`,
    `Pending assignment: ${vacant.map((t) => `${t.key} (${t.requiredRole})`).join(', ') || 'none'}.`,
    `Sprints: ${context.sprints.map((s) => `${s.name} ${s.startDate.toISOString().slice(0, 10)}→${s.endDate.toISOString().slice(0, 10)} ${s.status}`).join('; ') || 'none'}.`,
    risk ? `Schedule risk: completion ${new Date(risk.estimatedCompletion).toISOString().slice(0, 10)} vs deadline ${new Date(risk.deadline).toISOString().slice(0, 10)} (${risk.differenceDays} days late). ${risk.reasons.join(' ')}` : 'No schedule risk detected.',
    `Next due: ${upcoming.map((t) => `${t.key} "${t.title}" ${t.status} due ${t.dueDate?.toISOString().slice(0, 10)} assignee ${team.get(String(t.assignee)) ?? 'vacant'}`).join('; ')}`,
  ].join('\n')
}

/** The manager wrote to the Orchestrator. Understand, route, act and record the conversation. */
export function handlePrompt(projectId, text) {
  if (!llmConfigured) throw new HttpError(503, 'AI agents are not configured on the server (LLM_API_KEY is missing).')
  return runJob(projectId, { agent: 'orchestrator', action: 'handle_prompt', trigger: 'USER_PROMPT' }, async (runCtx) => {
    await runCtx.step('Understanding the request')
    let context = await loadContext(projectId)
    const { memory } = context
    // Record the message first so it is never lost, even if the agents fail below.
    memory.userContext.prompts.push({ at: new Date(), text, intent: '', response: '' })
    const entry = memory.userContext.prompts.at(-1)
    await memory.save()
    try {
      return await respondToPrompt(projectId, runCtx, { text, context, memory, entry })
    } catch (err) {
      entry.intent = 'error'
      entry.response = `Sorry, I couldn't process that request (${err.message}). Please try again.`
      await memory.save()
      throw err
    }
  })
}

async function respondToPrompt(projectId, runCtx, { text, context, memory, entry }) {
  {
    const open = memory.userContext.clarifications.filter((c) => !c.answer)
    const orchestrator = getAgent('orchestrator')
    const route = await orchestrator.skills.routeRequest(runCtx, { text, context, openClarifications: open })
    entry.intent = route.intent
    await memory.save()

    let response
    let follow
    switch (route.intent) {
      case 'plan_project': {
        response = context.project.brd ? 'Planning the project from the BRD and Project Memory. Progress is shown below.' : 'Upload a BRD first, then I can plan the project.'
        if (context.project.brd) follow = () => requestPlanning(projectId, 'USER_PROMPT')
        break
      }
      case 'add_requirements': {
        const existing = memory.brd.requirements.filter((r) => r.source === 'user').length
        const added = route.requirements.filter((r) => r.text.trim()).map((r, i) => ({
          id: `USR-${existing + i + 1}`, type: r.type, text: r.text.trim(), area: '', acceptanceCriteria: [], source: 'user',
        }))
        memory.brd.requirements.push(...added)
        memory.decisions.push({ at: new Date(), by: 'manager', text: `Added requirement(s): ${added.map((r) => `${r.id} ${r.text}`).join('; ')}` })
        await memory.save()
        await audit(projectId, {
          agent: 'orchestrator', action: 'add_requirements', run: runCtx.run._id, inputContext: text,
          decision: `Stored ${added.length} new requirement(s) in Project Memory`, reason: 'Requested by the manager.',
          entityType: 'ProjectMemory', entityId: memory._id, newState: { requirements: added.map((r) => r.id) },
        })
        response = added.length
          ? `Added ${added.map((r) => r.id).join(', ')} to the requirements. The Planning Agent will plan them${policyFor(memory, 'change_scope') === 'approval' ? ' and ask for your approval before changing the backlog' : ''}.`
          : 'I could not find a concrete requirement in that message. Could you rephrase it as a feature to build?'
        if (added.length) follow = () => requestPlanning(projectId, 'USER_PROMPT')
        break
      }
      case 'change_deadline':
      case 'set_start_date': {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(route.date) ? new Date(route.date) : null
        if (!date) { response = 'Which date do you mean? Please give it as a calendar date.'; break }
        const field = route.intent === 'change_deadline' ? 'deadline' : 'startDate'
        const label = field === 'deadline' ? 'deadline' : 'start date'
        if (policyFor(memory, 'change_deadline') === 'approval') {
          await propose(projectId, {
            action: 'change_date', proposedBy: 'orchestrator', dedupeKey: `${field}:${route.date}`,
            title: `Change the project ${label} to ${date.toDateString()}`, reason: `Requested in chat: "${text}"`,
            payload: { field, date: route.date },
          })
          response = `I've prepared the ${label} change to ${date.toDateString()}. Approve it in Pending approvals to apply it.`
        } else {
          await applyDateChange(projectId, field, route.date, runCtx.run._id)
          response = `The ${label} is now ${date.toDateString()}. I re-planned the schedule.`
          follow = () => requestReconcile(projectId, 'USER_PROMPT', `Project ${label} changed`)
        }
        break
      }
      case 'add_instruction': {
        const instruction = route.instruction.trim() || text
        memory.userContext.instructions.push({ at: new Date(), text: instruction })
        await memory.save()
        await audit(projectId, {
          agent: 'orchestrator', action: 'remember_instruction', run: runCtx.run._id, inputContext: text,
          decision: `Remembered: ${instruction}`, reason: 'Instructions guide all future planning.', entityType: 'ProjectMemory', entityId: memory._id,
        })
        response = `Noted. I'll apply this to all future planning: "${instruction}"`
        break
      }
      case 'answer_clarification': {
        let answered = 0
        for (const a of route.clarificationAnswers) {
          const c = open[Number(a.number) - 1]
          if (c && a.answer.trim()) { c.answer = a.answer.trim(); c.answeredAt = new Date(); answered++ }
        }
        await memory.save()
        response = answered ? `Thanks, recorded ${answered} answer(s).` : 'I could not match that to an open question. You can also answer them directly in the Clarifications list.'
        if (answered && !memory.userContext.clarifications.some((c) => c.critical && !c.answer)) {
          follow = () => requestPlanning(projectId, 'CLARIFICATION_ANSWERED')
          response += ' Resuming planning.'
        }
        break
      }
      case 'reschedule':
        response = 'Re-running scheduling and assignment with the current team and workload.'
        follow = () => requestReconcile(projectId, 'USER_PROMPT', 'Requested by the manager')
        break
      default: {
        await runCtx.step('Answering from Project Memory')
        context = await loadContext(projectId)
        response = await orchestrator.skills.answerQuestion(runCtx, { text, context, facts: stateFacts(context) })
      }
    }

    entry.response = response
    await memory.save()
    if (follow) follow()
    return { summary: response }
  }
}

// ---------------- Approvals and settings ----------------

async function applyDateChange(projectId, field, isoDate, runId) {
  const memory = await getMemory(projectId)
  const previous = memory.info[field]
  memory.info[field] = new Date(isoDate)
  memory.decisions.push({ at: new Date(), by: 'manager', text: `Project ${field === 'deadline' ? 'deadline' : 'start date'} set to ${isoDate}` })
  await memory.save()
  await audit(projectId, {
    agent: 'orchestrator', action: field === 'deadline' ? 'change_deadline' : 'change_start_date', run: runId,
    decision: `Set ${field} to ${isoDate}`, reason: 'Approved by the manager.', entityType: 'ProjectMemory', entityId: memory._id,
    previousState: { [field]: previous ?? null }, newState: { [field]: memory.info[field] },
  })
}

export async function decideApproval(projectId, actionId, decision) {
  const pending = await PendingAction.findOne({ _id: actionId, project: projectId })
  if (!pending) throw new HttpError(404, 'Approval request not found')
  if (pending.status !== 'pending') throw new HttpError(409, `This request was already ${pending.status}`)
  pending.status = decision === 'approve' ? 'approved' : 'rejected'
  pending.decidedAt = new Date()
  await pending.save()
  await audit(projectId, {
    agent: 'manager', action: decision === 'approve' ? 'approve' : 'reject', entityType: 'PendingAction', entityId: pending._id,
    decision: `${decision === 'approve' ? 'Approved' : 'Rejected'}: ${pending.title}`, reason: pending.reason,
  })
  if (decision !== 'approve') return pending

  const { payload } = pending
  runJob(projectId, { agent: 'orchestrator', action: `apply_${pending.action}`, trigger: 'APPROVAL_DECIDED' }, async (runCtx) => {
    if (pending.action === 'apply_plan') {
      await runCtx.step('Writing the approved plan')
      const memory = await getMemory(projectId)
      await applyProposal(projectId, payload.proposal, runCtx)
      memory.planning.lastPlannedAt = new Date()
      await memory.save()
    } else if (pending.action === 'change_date') {
      await applyDateChange(projectId, payload.field, payload.date, runCtx.run._id)
    } else if (pending.action === 'reassign_task') {
      // Clearing the assignee lets the engine pick the best available member in reconcile().
      await WorkItem.updateOne({ _id: payload.taskId }, { $set: { assignee: null, 'assignment.state': 'pending' } })
    } else if (pending.action === 'apply_assignments') {
      for (const a of payload.assignments) {
        await WorkItem.updateOne({ _id: a.taskId, assignee: null }, { $set: { assignee: a.memberId, 'assignment.state': 'assigned', 'assignment.reason': null } })
      }
    }
    const r = await reconcile(projectId, { runId: runCtx.run._id, reason: `Approved: ${pending.title}` })
    return { summary: `Applied "${pending.title}". ${r.assigned} task(s) assigned.` }
  })
  return pending
}

/** Answer to a clarification from the UI. Resumes planning once no critical question is open. */
export async function answerClarification(projectId, index, answer) {
  const memory = await getMemory(projectId)
  const c = memory.userContext.clarifications[index]
  if (!c) throw new HttpError(404, 'Clarification not found')
  c.answer = answer
  c.answeredAt = new Date()
  await memory.save()
  await audit(projectId, {
    agent: 'manager', action: 'answer_clarification', entityType: 'ProjectMemory', entityId: memory._id,
    decision: `Answered: ${c.question}`, reason: answer,
  })
  const stillBlocked = memory.userContext.clarifications.some((x) => x.critical && !x.answer)
  if (!stillBlocked && memory.planning.status === 'awaiting_clarification') requestPlanning(projectId, 'CLARIFICATION_ANSWERED')
  return memory
}

/**
 * Hourly housekeeping: keeps sprint statuses current and emails assignees as their tasks come
 * into the upcoming sprint window. Runs quietly (no AgentRun entry) through the project queue.
 */
export function startTicker(intervalMs = 60 * 60 * 1000) {
  const tick = async () => {
    const { ProjectMemory } = await import('../../models/ProjectMemory.js')
    const planned = await ProjectMemory.find({ 'planning.status': 'planned' }).select('project').lean()
    for (const { project } of planned) {
      if (!(await WorkItem.exists({ project, type: 'task', status: { $ne: 'done' } }))) continue
      enqueue(project, 'tick', () => reconcile(project, { reason: 'Scheduled check' })).catch((err) => {
        console.error(`[orchestrator] tick failed for ${project}:`, err.message)
      })
    }
  }
  const timer = setInterval(tick, intervalMs)
  timer.unref()
  return timer
}

export async function recoverOnBoot() {
  const n = await recoverStaleRuns()
  const { ProjectMemory } = await import('../../models/ProjectMemory.js')
  await ProjectMemory.updateMany({ 'planning.status': 'running' }, { $set: { 'planning.status': 'failed' } })
  if (n) console.log(`[orchestrator] marked ${n} interrupted run(s) as failed`)
}


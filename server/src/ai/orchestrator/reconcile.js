import { Sprint } from '../../models/Sprint.js'
import { WorkItem } from '../../models/WorkItem.js'
import { audit } from '../audit.js'
import { startOfDay } from '../engine/calendar.js'
import { computeBlocking, rollupStatuses } from '../engine/dependencies.js'
import { schedule } from '../engine/scheduler.js'
import { loadContext } from '../memory/projectMemory.js'
import { sendTaskAssignedEmail } from '../notifications.js'
import { policyFor, propose } from './policy.js'
import { enqueue } from './runs.js'

const id = (x) => String(x?._id ?? x)
const sameDay = (a, b) => (a && b ? startOfDay(a).getTime() === startOfDay(b).getTime() : !a && !b)

function sprintGoal(stories) {
  if (!stories.length) return 'Finish carried-over work'
  const names = stories.slice(0, 3).map((s) => s.title.replace(/\.$/, ''))
  return `Deliver: ${names.join('; ')}${stories.length > 3 ? ` and ${stories.length - 3} more` : ''}`
}

/**
 * Brings the whole project to a consistent state after any change:
 * blocking → roll-ups → schedule/assignment → sprints → risk → notifications.
 * Returns what changed so callers can report "next actionable work".
 */
export async function reconcile(projectId, { runId, agent = 'orchestrator', reason = 'Project state changed' } = {}) {
  const context = await loadContext(projectId)
  const { project, memory, eligibleTeam } = context
  const items = context.items
  const byId = new Map(items.map((i) => [id(i._id), i]))
  const ops = []
  const unblocked = []

  // 1. Dependencies: which open tasks are blocked, and which just became actionable.
  for (const change of computeBlocking(items)) {
    const { item, blockedBy, blockedReason, wasBlocked } = change
    item.blockedBy = blockedBy
    ops.push({ updateOne: { filter: { _id: item._id }, update: { $set: { blockedBy, blockedReason: blockedReason ?? null } } } })
    if (item.type !== 'task') continue
    if (wasBlocked && blockedBy.length === 0) {
      unblocked.push(item)
      await audit(projectId, {
        agent, action: 'task_unblocked', run: runId, entityType: 'WorkItem', entityId: item._id, entityKey: item.key,
        decision: `${item.key} is now actionable`, reason: 'All of its dependencies are completed.',
        previousState: { blocked: true }, newState: { blocked: false },
      })
    } else if (!wasBlocked && blockedBy.length && !(runId && String(item.createdByRun) === String(runId))) {
      // Tasks created blocked in this same planning run are not news; only record later changes.
      await audit(projectId, {
        agent, action: 'task_blocked', run: runId, entityType: 'WorkItem', entityId: item._id, entityKey: item.key,
        decision: `${item.key} is blocked`, reason: blockedReason, previousState: { blocked: false }, newState: { blocked: true },
      })
    }
  }

  // 2. Story and epic status follow their tasks.
  for (const { item, status } of rollupStatuses(items)) {
    item.status = status
    ops.push({ updateOne: { filter: { _id: item._id }, update: { $set: { status } } } })
  }

  // 3. Schedule and assign (deterministic engine).
  const autoAssign = policyFor(memory, 'assign_task') === 'auto'
  const result = schedule(items, eligibleTeam, {
    startDate: memory.info.startDate ?? project.createdAt,
    deadline: memory.info.deadline,
    sprintLengthDays: memory.planning.sprintLengthDays,
    canReassign: () => policyFor(memory, 'reassign_critical_task') === 'auto',
  })

  // Sprints: upsert the ones the plan needs, drop empty planned ones beyond it.
  const today = startOfDay(new Date())
  const sprintIds = new Map()
  for (const s of result.sprints) {
    const storyIds = new Set(s.taskIds.map((t) => id(byId.get(id(t)).parent)))
    const stories = [...storyIds].map((sid) => byId.get(sid)).filter(Boolean)
    const epics = [...new Set(s.taskIds.map((t) => id(byId.get(id(t)).epic)))].filter((e) => byId.has(e))
    const status = s.endDate < today ? 'completed' : s.startDate <= today ? 'active' : 'planned'
    const doc = await Sprint.findOneAndUpdate(
      { project: projectId, number: s.number },
      {
        $set: {
          startDate: s.startDate, endDate: s.endDate, capacityHours: s.capacityHours, plannedHours: s.plannedHours,
          status, epics, deliverables: stories.map((st) => st.title).slice(0, 12),
        },
        $setOnInsert: { name: `${project.key} Sprint ${s.number}`, goal: sprintGoal(stories) },
      },
      { upsert: true, returnDocument: 'after' },
    )
    sprintIds.set(s.number, doc._id)
  }
  await Sprint.deleteMany({ project: projectId, number: { $gt: result.sprints.length }, status: 'planned' })

  const newlyAssigned = []
  const assignmentApprovals = []
  for (const r of result.tasks) {
    const task = byId.get(id(r._id))
    let assignee = r.assignee
    let state = r.assignmentState
    let why = r.assignmentReason
    if (!task.assignee && assignee && !autoAssign) {
      assignmentApprovals.push({ taskId: task._id, memberId: assignee })
      assignee = null
      state = 'pending'
      why = 'Assignment awaiting your approval'
    }
    const set = {
      plannedStart: r.plannedStart, plannedEnd: r.plannedEnd, dueDate: r.dueDate,
      sprint: sprintIds.get(r.sprintNumber), assignee: assignee ?? null,
      'assignment.state': state, 'assignment.reason': why ?? null,
    }
    const assigneeChanged = id(task.assignee ?? '') !== id(assignee ?? '')
    if (assigneeChanged && assignee) {
      set['assignment.assignedAt'] = new Date()
      set['assignment.notifiedAt'] = null
      set['assignment.notification'] = null
      newlyAssigned.push(task._id)
      const member = eligibleTeam.find((m) => id(m._id) === id(assignee))
      const skills = (task.skills ?? []).filter((k) => member.skills?.includes(k))
      await audit(projectId, {
        agent, action: task.assignee ? 'reassign_task' : 'assign_task', run: runId,
        entityType: 'WorkItem', entityId: task._id, entityKey: task.key,
        inputContext: `Needs ${task.requiredRole ?? 'any role'}${task.skills?.length ? `, skills ${task.skills.join(', ')}` : ''}; ${task.estimateHours} h; priority ${task.priority}`,
        decision: `Assigned ${task.key} to ${member.name} (${member.role})`,
        reason: `${member.role === task.requiredRole ? 'Exact role match' : `No free ${task.requiredRole}; ${member.role} can cover it`}${skills.length ? `, matching skills: ${skills.join(', ')}` : ''}; earliest possible finish given current workload (due ${r.dueDate.toDateString()}).`,
        previousState: { assignee: task.assignee ?? null }, newState: { assignee, dueDate: r.dueDate },
      })
    } else if (state === 'pending' && task.assignment?.state !== 'pending') {
      await audit(projectId, {
        agent, action: 'pending_assignment', run: runId, entityType: 'WorkItem', entityId: task._id, entityKey: task.key,
        decision: `${task.key} left unassigned (vacant)`, reason: why,
        previousState: { assignment: task.assignment?.state ?? null }, newState: { assignment: 'pending', requiredRole: task.requiredRole },
      })
    }
    const changed = assigneeChanged || task.assignment?.state !== state || !sameDay(task.dueDate, r.dueDate)
      || id(task.sprint ?? '') !== id(set.sprint ?? '')
    if (changed) ops.push({ updateOne: { filter: { _id: task._id }, update: { $set: set } } })
  }

  // Subtasks follow their task; stories and epics span their children.
  const planned = new Map(result.tasks.map((r) => [id(r._id), r]))
  for (const item of items) {
    if (item.type === 'subtask') {
      const parent = planned.get(id(item.parent))
      if (!parent) continue
      ops.push({ updateOne: { filter: { _id: item._id }, update: { $set: {
        assignee: parent.assignmentState === 'assigned' ? parent.assignee : null,
        'assignment.state': parent.assignmentState, sprint: sprintIds.get(parent.sprintNumber),
        plannedStart: parent.plannedStart, plannedEnd: parent.plannedEnd, dueDate: parent.dueDate,
      } } } })
    }
  }
  const span = (pred) => {
    const kids = result.tasks.filter((r) => pred(byId.get(id(r._id))))
    if (!kids.length) return null
    return { plannedStart: new Date(Math.min(...kids.map((k) => k.plannedStart))), plannedEnd: new Date(Math.max(...kids.map((k) => k.plannedEnd))) }
  }
  for (const item of items) {
    if (item.type !== 'story' && item.type !== 'epic') continue
    const s = span((t) => id(item.type === 'story' ? t.parent : t.epic) === id(item._id))
    if (s) ops.push({ updateOne: { filter: { _id: item._id }, update: { $set: { ...s, dueDate: s.plannedEnd } } } })
  }
  if (ops.length) await WorkItem.bulkWrite(ops)

  // 4. Approvals the engine could not decide on its own.
  for (const { task, reason: why } of result.needsApproval) {
    await propose(projectId, {
      action: 'reassign_task', proposedBy: 'orchestrator', dedupeKey: `reassign:${task._id}`,
      title: `Reassign ${task.key} "${task.title}"`, reason: why,
      summary: `${task.priority} priority task. Approving lets the engine pick the best available ${task.requiredRole}.`,
      payload: { taskId: String(task._id) },
    })
  }
  if (assignmentApprovals.length) {
    await propose(projectId, {
      action: 'apply_assignments', proposedBy: 'orchestrator', dedupeKey: `assign:${assignmentApprovals.map((a) => a.taskId).join(',')}`,
      title: `Assign ${assignmentApprovals.length} task(s) to team members`,
      reason: 'Automatic assignment is set to require approval.', summary: 'The engine picked assignees by role, skills and workload.',
      payload: { assignments: assignmentApprovals.map((a) => ({ taskId: String(a.taskId), memberId: String(a.memberId) })) },
    })
  }

  // 5. Schedule risk in memory.
  const previousRisk = memory.planning.scheduleRisk
  memory.planning.scheduleRisk = result.risk
  memory.planning.vacantRoles = result.vacantRoles
  memory.markModified('planning')
  await memory.save()
  if (result.risk && result.risk.differenceDays !== previousRisk?.differenceDays) {
    await audit(projectId, {
      agent, action: 'schedule_risk', run: runId, entityType: 'Project', entityId: project._id,
      decision: `Estimated completion ${result.risk.estimatedCompletion.toDateString()} is ${result.risk.differenceDays} day(s) after the deadline`,
      reason: result.risk.reasons.join(' '), previousState: previousRisk ? { differenceDays: previousRisk.differenceDays } : null,
      newState: { differenceDays: result.risk.differenceDays },
    })
  }

  // 6. Notify assignees about work that starts within the coming sprint window. Later tasks are
  // announced by the hourly tick as they approach, so nobody gets dozens of emails on day one.
  let emailed = 0
  if (policyFor(memory, 'send_notifications') === 'auto') {
    const horizon = new Date(today.getTime() + memory.planning.sprintLengthDays * 86_400_000)
    const due = items.filter((t) => {
      const r = planned.get(id(t._id))
      if (!r || r.assignmentState !== 'assigned' || r.plannedStart > horizon) return false
      return newlyAssigned.some((n) => id(n) === id(t._id)) || !t.assignment?.notifiedAt
    })
    // Mark as attempted now, send in a follow-up job: the caller (e.g. a board move) never waits on SMTP,
    // and a failed delivery is recorded once instead of being retried on every change.
    if (due.length) {
      await WorkItem.updateMany({ _id: { $in: due.map((t) => t._id) } }, { $set: { 'assignment.notifiedAt': new Date() } })
      emailed = due.length
      // A separate queue per project: slow SMTP never delays planning or board updates.
      enqueue(`${projectId}:notify`, null, () => notifyAssignees(projectId, due.map((t) => t._id), { runId, agent }))
        .catch((err) => console.error('[orchestrator] notification job failed:', err.message))
    }
  }

  return {
    assigned: newlyAssigned.length, emailed, unblocked: unblocked.map((t) => t.key),
    vacantRoles: result.vacantRoles, risk: result.risk, sprints: result.sprints.length, reason,
  }
}

/** Sends the "New Task Assigned" email for each task and records it. */
export async function notifyAssignees(projectId, taskIds, { runId, agent = 'orchestrator' } = {}) {
  const context = await loadContext(projectId)
  const byId = new Map(context.items.map((i) => [id(i._id), i]))
  const reqs = new Map(context.memory.brd.requirements.map((r) => [r.id, r]))
  let sent = 0
  for (const taskId of taskIds) {
    const task = byId.get(id(taskId))
    const member = task?.assignee && context.team.find((m) => id(m._id) === id(task.assignee))
    if (!member) continue
    let delivered = false
    let error
    try {
      delivered = await sendTaskAssignedEmail({
        project: context.project, member, task,
        epic: byId.get(id(task.epic)), story: byId.get(id(task.parent)),
        subtasks: context.items.filter((i) => i.type === 'subtask' && id(i.parent) === id(task._id)),
        dependencies: task.dependsOn.map((d) => byId.get(id(d))).filter(Boolean),
        requirements: task.brdRefs.map((r) => reqs.get(r)).filter(Boolean),
      })
    } catch (err) {
      error = err.message
    }
    if (delivered) sent += 1
    await WorkItem.updateOne({ _id: task._id }, {
      $set: { 'assignment.notifiedAt': new Date(), 'assignment.notification': delivered ? 'sent' : error ? 'failed' : 'not_configured' },
    })
    await audit(projectId, {
      agent, action: 'notify_assignee', run: runId, entityType: 'WorkItem', entityId: task._id, entityKey: task.key,
      decision: delivered ? `Emailed ${member.name} <${member.email}> about ${task.key}` : `Could not email ${member.name} about ${task.key}`,
      reason: delivered ? 'A task was assigned to them.' : (error ?? 'Email delivery is not configured.'),
    })
  }
  return sent
}

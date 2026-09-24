import { ROLE_FALLBACKS } from '../../config/constants.js'
import { addDays, daysBetween, makeCalendar, startOfDay } from './calendar.js'
import { effectiveDependencies, indexItems } from './dependencies.js'

/**
 * Deterministic scheduling and assignment. The LLM decides *what* work exists; this module decides
 * *who* does it and *when*, so capacity, dependencies and deadlines are always computed exactly.
 */

const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 }
// Share of the estimate still to do, by status.
const REMAINING = { todo: 1, in_progress: 0.6, in_review: 0.25 }
// Hours per day assumed for work that has no one to do it yet, so its dates can still be estimated.
const VACANT_DAILY_HOURS = 6
const DEFAULT_TASK_HOURS = 4

const id = (x) => String(x?._id ?? x)

/** Dependency-respecting order; among ready tasks the most important goes first. */
function orderTasks(open, depsOf, rank) {
  const indegree = new Map(open.map((t) => [id(t._id), 0]))
  const dependents = new Map()
  for (const t of open) {
    for (const d of depsOf.get(id(t._id))) {
      if (!indegree.has(d)) continue
      indegree.set(id(t._id), indegree.get(id(t._id)) + 1)
      if (!dependents.has(d)) dependents.set(d, [])
      dependents.get(d).push(id(t._id))
    }
  }
  const byId = new Map(open.map((t) => [id(t._id), t]))
  const ready = open.filter((t) => indegree.get(id(t._id)) === 0)
  const ordered = []
  while (ready.length) {
    ready.sort((a, b) => rank(a) - rank(b))
    const next = ready.shift()
    ordered.push(next)
    for (const dep of dependents.get(id(next._id)) ?? []) {
      indegree.set(dep, indegree.get(dep) - 1)
      if (indegree.get(dep) === 0) ready.push(byId.get(dep))
    }
  }
  // Anything left is part of a dependency cycle; schedule it anyway rather than dropping work.
  const cyclic = open.filter((t) => !ordered.includes(t)).sort((a, b) => rank(a) - rank(b))
  return { ordered: [...ordered, ...cyclic], cyclic }
}

function skillOverlap(member, task) {
  const skills = new Set((member.skills ?? []).map((s) => s.toLowerCase()))
  return (task.skills ?? []).filter((s) => skills.has(s.toLowerCase())).length
}

/**
 * @param items   every work item of the project (plain objects)
 * @param team    eligible members: active, available and on this project
 * @param options { startDate, deadline, sprintLengthDays, today, canReassign(task) }
 */
export function schedule(items, team, options) {
  const today = startOfDay(options.today ?? new Date())
  const startDate = startOfDay(options.startDate ?? today)
  const cal = makeCalendar(startDate)
  const now = cal.toIndex(today > startDate ? today : startDate)
  const sprintLength = options.sprintLengthDays ?? 14

  const { byId, tasksByEpic } = indexItems(items)
  const tasks = items.filter((i) => i.type === 'task')
  const open = tasks.filter((t) => t.status !== 'done')
  const depsOf = new Map(tasks.map((t) => [id(t._id), effectiveDependencies(t, byId, tasksByEpic)]))

  const order = (item) => item?.order ?? 0
  const rank = (t) => {
    const story = byId.get(id(t.parent))
    const epic = byId.get(id(t.epic))
    return PRIORITY_RANK[t.priority] * 1e9 + order(epic) * 1e6 + order(story) * 1e3 + order(t)
  }
  const { ordered, cyclic } = orderTasks(open, depsOf, rank)

  const members = new Map(team.map((m) => [id(m._id), {
    member: m,
    daily: Math.max(1, (m.capacityHoursPerWeek ?? 30) / 5),
    freeAt: now,
    hours: 0,
  }]))
  const vacant = new Map() // role -> virtual resource
  const finish = new Map()
  const results = []
  const needsApproval = []

  for (const task of ordered) {
    const deps = depsOf.get(id(task._id))
    const earliest = Math.max(now, ...deps.map((d) => finish.get(d) ?? now))
    const hours = Math.max(1, task.estimateHours || DEFAULT_TASK_HOURS) * (REMAINING[task.status] ?? 1)

    let slot = task.assignee ? members.get(id(task.assignee)) : undefined
    let state = 'assigned'
    let reason

    if (task.assignee && !slot) {
      // The current assignee left, became unavailable or was removed from the project.
      const critical = task.priority === 'Critical' || task.priority === 'High'
      if (critical && !options.canReassign?.(task)) {
        needsApproval.push({ task, reason: 'The assigned member is no longer available' })
        state = 'pending'
        reason = 'Reassignment awaiting approval: the assigned member is no longer available'
      }
    }

    if (!slot && state === 'assigned') {
      const role = task.requiredRole
      const pools = role ? [role, ...(ROLE_FALLBACKS[role] ?? [])] : [null]
      for (const poolRole of pools) {
        const candidates = [...members.values()].filter((s) => !poolRole || s.member.role === poolRole)
        if (candidates.length === 0) continue
        // Earliest finish wins; matching skills and lighter workload break ties.
        candidates.sort((a, b) => {
          const endA = Math.max(earliest, a.freeAt) + hours / a.daily
          const endB = Math.max(earliest, b.freeAt) + hours / b.daily
          return endA - endB || skillOverlap(b.member, task) - skillOverlap(a.member, task) || a.hours - b.hours
        })
        slot = candidates[0]
        break
      }
      if (!slot) {
        state = 'pending'
        reason = `No available team member with the ${role ?? 'required'} role`
      }
    }

    let resource = slot
    if (!resource) {
      const key = task.requiredRole ?? 'Unassigned'
      if (!vacant.has(key)) vacant.set(key, { daily: VACANT_DAILY_HOURS, freeAt: now, hours: 0 })
      resource = vacant.get(key)
    }

    const start = Math.max(earliest, resource.freeAt)
    const end = start + hours / resource.daily
    resource.freeAt = end
    resource.hours += hours
    finish.set(id(task._id), end)

    const plannedStart = cal.toDate(start)
    const plannedEnd = cal.toDate(Math.max(Math.floor(start), Math.ceil(end) - 1))
    results.push({
      _id: task._id,
      assignee: state === 'assigned' ? slot.member._id : (state === 'pending' && task.assignee && !slot ? task.assignee : null),
      assignmentState: state,
      assignmentReason: reason,
      plannedStart,
      plannedEnd,
      dueDate: plannedEnd,
      sprintNumber: Math.floor(daysBetween(startDate, plannedStart) / sprintLength) + 1,
      hours,
    })
  }

  // ---- Sprints ----
  const sprintCount = Math.max(0, ...results.map((r) => r.sprintNumber))
  const dailyTeamHours = [...members.values()].reduce((sum, s) => sum + s.daily, 0)
  const sprints = []
  for (let n = 1; n <= sprintCount; n++) {
    const s = addDays(startDate, (n - 1) * sprintLength)
    const e = addDays(s, sprintLength - 1)
    const workingDays = cal.toIndex(addDays(e, 1)) - cal.toIndex(s)
    const inSprint = results.filter((r) => r.sprintNumber === n)
    sprints.push({
      number: n,
      startDate: s,
      endDate: e,
      capacityHours: Math.round(dailyTeamHours * workingDays),
      plannedHours: Math.round(inSprint.filter((r) => r.assignmentState === 'assigned').reduce((sum, r) => sum + r.hours, 0)),
      taskIds: inSprint.map((r) => r._id),
    })
  }

  // ---- Schedule risk ----
  const estimatedCompletion = results.length ? new Date(Math.max(...results.map((r) => r.plannedEnd))) : null
  const vacantRoles = [...new Set(results.filter((r) => r.assignmentState === 'pending').map((r) => byId.get(id(r._id)).requiredRole ?? 'Unassigned'))]
  let risk = null
  if (options.deadline && estimatedCompletion && estimatedCompletion > startOfDay(options.deadline)) {
    const deadline = startOfDay(options.deadline)
    const remainingHours = Math.round(results.reduce((sum, r) => sum + r.hours, 0))
    const availableHours = Math.round(dailyTeamHours * Math.max(0, cal.toIndex(addDays(deadline, 1)) - now))
    const reasons = []
    if (remainingHours > availableHours) {
      reasons.push(`Insufficient available team capacity: ${remainingHours} h of work remaining but only ${availableHours} h available before the deadline.`)
    }
    if (vacantRoles.length) reasons.push(`No available team member for: ${vacantRoles.join(', ')}.`)
    if (!reasons.length) reasons.push('Task dependencies force work to happen in sequence, so extra people cannot shorten the critical path.')
    risk = {
      estimatedCompletion,
      deadline,
      differenceDays: daysBetween(deadline, estimatedCompletion),
      reasons,
    }
  }

  return { tasks: results, sprints, estimatedCompletion, vacantRoles, risk, needsApproval, cyclic: cyclic.map((t) => t.key) }
}

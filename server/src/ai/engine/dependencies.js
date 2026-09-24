/**
 * Dependency engine: works out which open items are blocked, and rolls task status up to stories
 * and epics. Pure functions over plain objects so it can be reused by the scheduler and tests.
 */

const id = (x) => String(x?._id ?? x)

// Epic B depending on epic A means B starts once A is *built*; A's testing may continue alongside B.
const isBuildTask = (t) => t.requiredRole !== 'QA Engineer'

/** Effective prerequisites of a task: its own dependsOn plus the build tasks of epics its epic depends on. */
export function effectiveDependencies(item, byId, tasksByEpic) {
  const deps = new Set(item.dependsOn.map(id))
  const epic = item.epic && byId.get(id(item.epic))
  for (const epicDep of epic?.dependsOn ?? []) {
    for (const t of tasksByEpic.get(id(epicDep)) ?? []) if (isBuildTask(t)) deps.add(id(t._id))
  }
  deps.delete(id(item._id))
  return [...deps].filter((d) => byId.has(d))
}

export function indexItems(items) {
  const byId = new Map(items.map((i) => [id(i._id), i]))
  const tasksByEpic = new Map()
  for (const i of items) {
    if (i.type !== 'task' || !i.epic) continue
    const k = id(i.epic)
    if (!tasksByEpic.has(k)) tasksByEpic.set(k, [])
    tasksByEpic.get(k).push(i)
  }
  return { byId, tasksByEpic }
}

/** Returns [{ item, blockedBy, blockedReason }] for every task/subtask whose blocking state changed. */
export function computeBlocking(items) {
  const { byId, tasksByEpic } = indexItems(items)
  const changes = []
  for (const item of items) {
    if (item.type !== 'task' && item.type !== 'subtask') continue
    let blockedBy = []
    if (item.status !== 'done') {
      const source = item.type === 'subtask' ? byId.get(id(item.parent)) ?? item : item
      blockedBy = effectiveDependencies(source, byId, tasksByEpic).filter((d) => byId.get(d).status !== 'done')
    }
    const before = item.blockedBy.map(id).sort().join()
    const after = [...blockedBy].sort().join()
    if (before !== after) {
      const names = blockedBy.slice(0, 3).map((d) => byId.get(d).key)
      const reason = blockedBy.length
        ? `Waiting for ${names.join(', ')}${blockedBy.length > 3 ? ` and ${blockedBy.length - 3} more` : ''} to be completed`
        : undefined
      changes.push({ item, blockedBy, blockedReason: reason, wasBlocked: before !== '' })
    }
  }
  return changes
}

/** Derived status for stories and epics from their tasks. */
export function rollupStatuses(items) {
  const children = new Map()
  for (const i of items) {
    if (!i.parent) continue
    const k = id(i.parent)
    if (!children.has(k)) children.set(k, [])
    children.get(k).push(i)
  }
  const statusOf = (item) => {
    if (item.type === 'task' || item.type === 'subtask') return item.status
    const kids = (children.get(id(item._id)) ?? []).map(statusOf)
    if (kids.length === 0) return item.status
    if (kids.every((s) => s === 'done')) return 'done'
    if (kids.some((s) => s !== 'todo')) return 'in_progress'
    return 'todo'
  }
  const changes = []
  for (const i of items) {
    if (i.type !== 'story' && i.type !== 'epic') continue
    const next = statusOf(i)
    if (next !== i.status) changes.push({ item: i, status: next })
  }
  return changes
}

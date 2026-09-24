export const STATUSES = [
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
]
export const STATUS_LABEL = Object.fromEntries(STATUSES.map((s) => [s.id, s.label]))

export const fmtDate = (d, opts = { day: 'numeric', month: 'short' }) => (d ? new Date(d).toLocaleDateString(undefined, opts) : '—')
export const fmtHours = (h) => (h >= 6 ? `${Math.round((h / 6) * 10) / 10}d` : `${h}h`)

export const isBlocked = (item) => item.blockedBy?.length > 0 && item.status !== 'done'
export const isVacant = (item) => item.type === 'task' && item.assignment?.state === 'pending' && item.status !== 'done'

/** Indexes the flat work-item list from the API for tree and board views. */
export function indexWorkItems(items) {
  const byId = new Map(items.map((i) => [i._id, i]))
  const children = new Map()
  for (const i of items) {
    if (!i.parent) continue
    if (!children.has(i.parent)) children.set(i.parent, [])
    children.get(i.parent).push(i)
  }
  for (const list of children.values()) list.sort((a, b) => a.order - b.order || a.number - b.number)
  const epics = items.filter((i) => i.type === 'epic').sort((a, b) => a.order - b.order)
  return { byId, children, epics, tasks: items.filter((i) => i.type === 'task') }
}

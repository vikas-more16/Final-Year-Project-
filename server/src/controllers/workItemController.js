import { AuditLog } from '../models/AuditLog.js'
import { Sprint } from '../models/Sprint.js'
import { TeamMember } from '../models/TeamMember.js'
import { WORK_ITEM_STATUSES, WorkItem } from '../models/WorkItem.js'
import { getMemory } from '../ai/memory/projectMemory.js'
import { updateStatus } from '../ai/orchestrator/index.js'
import { HttpError } from '../utils/HttpError.js'

const FIELDS = 'type number key title status priority parent epic estimateHours requiredRole skills assignee assignment sprint plannedStart plannedEnd dueDate blockedBy blockedReason brdRefs order dependsOn acceptanceCriteria'

export async function listWorkItems(req, res) {
  const [items, sprints, members] = await Promise.all([
    WorkItem.find({ project: req.project._id }).select(FIELDS).sort({ number: 1 }).lean(),
    Sprint.find({ project: req.project._id }).sort({ number: 1 }).lean(),
    TeamMember.find({ owner: req.user._id, projects: req.project._id }).select('name email role status availability skills capacityHoursPerWeek').lean(),
  ])
  res.json({
    items: items.map((i) => ({ ...i, id: i._id, acceptanceCount: i.acceptanceCriteria.length, acceptanceCriteria: undefined })),
    sprints: sprints.map((s) => ({ ...s, id: s._id })),
    members: members.map((m) => ({ id: m._id, name: m.name, email: m.email, role: m.role, status: m.status, availability: m.availability })),
  })
}

export async function getWorkItem(req, res) {
  const item = await WorkItem.findOne({ project: req.project._id, key: req.params.key }).lean()
  if (!item) throw new HttpError(404, 'Work item not found')
  const related = await WorkItem.find({
    project: req.project._id,
    $or: [
      { _id: { $in: [item.parent, item.epic, ...item.dependsOn, ...item.blockedBy].filter(Boolean) } },
      { parent: item._id },
      { dependsOn: item._id },
    ],
  }).select('key title type status parent dependsOn').lean()
  const pick = (ids) => related.filter((r) => ids.some((i) => String(i) === String(r._id)))
  const [memory, assignee, sprint, history] = await Promise.all([
    getMemory(req.project._id),
    item.assignee ? TeamMember.findById(item.assignee).select('name email role').lean() : null,
    item.sprint ? Sprint.findById(item.sprint).select('name startDate endDate').lean() : null,
    AuditLog.find({ project: req.project._id, entityKey: item.key }).sort({ at: -1 }).limit(30).lean(),
  ])
  const reqIds = new Set(item.brdRefs)
  res.json({
    item: { ...item, id: item._id },
    parent: pick([item.parent])[0] ?? null,
    epic: pick([item.epic])[0] ?? null,
    children: related.filter((r) => String(r.parent) === String(item._id)),
    dependencies: pick(item.dependsOn),
    blockedBy: pick(item.blockedBy),
    dependents: related.filter((r) => r.dependsOn?.some((d) => String(d) === String(item._id))),
    requirements: memory.brd.requirements.filter((r) => reqIds.has(r.id)),
    assignee,
    sprint,
    history,
  })
}

export async function patchStatus(req, res) {
  const { status, acceptanceVerified } = req.body
  if (!WORK_ITEM_STATUSES.includes(status)) throw new HttpError(422, 'Unknown status')
  const result = await updateStatus(req.project._id, req.params.key, { status, acceptanceVerified: Boolean(acceptanceVerified) })
  res.json({ key: result.item.key, status: result.item.status, unblocked: result.unblocked, assigned: result.assigned })
}

import mongoose from 'mongoose'
import { MEMBER_ROLES } from '../../config/constants.js'
import { Project } from '../../models/Project.js'
import { WorkItem } from '../../models/WorkItem.js'
import { getAgent } from '../agents/registry.js'
import { audit } from '../audit.js'
import { loadBrdText } from '../brdText.js'
import { loadContext } from '../memory/projectMemory.js'
import { policyFor, propose } from './policy.js'

const PLANNABLE = new Set(['functional', 'business_rule', 'dependency'])
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || lo)))
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Requirements no existing work item references yet: what still needs planning. */
export function uncoveredRequirements(memory, items) {
  const covered = new Set(items.flatMap((i) => i.brdRefs))
  return memory.brd.requirements.filter((r) => PLANNABLE.has(r.type) && !covered.has(r.id))
}

async function analyzeBrdIntoMemory(runCtx, context) {
  const { project, memory } = context
  await runCtx.step('Extracting text from the BRD')
  const text = await loadBrdText(project.brd)
  if (text.length < 40) throw new Error('The BRD appears to be empty or unreadable (for example a scanned PDF without text).')

  const analysis = await getAgent('planning').skills.analyzeBrd(runCtx, text)
  const userReqs = memory.brd.requirements.filter((r) => r.source === 'user')
  const previous = memory.brd.requirements.length

  memory.brd.fileId = project.brd.fileId
  memory.brd.textChars = text.length
  memory.brd.analyzedAt = new Date()
  memory.brd.requirements = [...analysis.requirements, ...userReqs]
  memory.brd.userRoles = analysis.userRoles
  memory.brd.workflows = analysis.workflows
  const info = memory.info
  const union = (a, b) => [...new Set([...(a ?? []), ...b])]
  info.summary ||= analysis.summary
  info.objectives = union(info.objectives, analysis.objectives)
  info.scope = union(info.scope, analysis.scope)
  info.outOfScope = union(info.outOfScope, analysis.outOfScope)
  info.constraints = union(info.constraints, analysis.constraints)
  info.techStack = union(info.techStack, analysis.techStack)
  if (!info.deadline && analysis.deadline) info.deadline = new Date(analysis.deadline)
  await memory.save()

  const counts = analysis.requirements.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {})
  await audit(project._id, {
    agent: 'planning', action: 'analyze_brd', run: runCtx.run._id,
    inputContext: `${project.brd.originalName} (${text.length} characters, ${analysis.chunks} section(s))`,
    decision: `Extracted ${analysis.requirements.length} requirements: ${Object.entries(counts).map(([k, v]) => `${v} ${k.replace('_', '-')}`).join(', ')}`,
    reason: 'A BRD was uploaded or changed, so the requirements baseline in Project Memory was rebuilt.',
    entityType: 'ProjectMemory', entityId: memory._id,
    previousState: { requirements: previous }, newState: { requirements: memory.brd.requirements.length },
  })
}

function sanitizeDecomposition(decomposition, knownIds) {
  const refs = new Set()
  const stories = decomposition.stories.slice(0, 6).map((s, si) => ({
    ...s,
    brdRefs: s.brdRefs.filter((r) => knownIds.has(r)),
    acceptanceCriteria: s.acceptanceCriteria.filter((c) => c.trim()),
    tasks: s.tasks.slice(0, 6).map((t, ti) => {
      let ref = t.ref?.trim() || `T${si + 1}.${ti + 1}`
      while (refs.has(ref)) ref = `${ref}'`
      refs.add(ref)
      return {
        ...t,
        ref,
        requiredRole: MEMBER_ROLES.includes(t.requiredRole) ? t.requiredRole : 'Full Stack Developer',
        estimateHours: clamp(t.estimateHours, 1, 80),
        skills: [...new Set(t.skills.map((k) => k.toLowerCase().trim()).filter(Boolean))].slice(0, 6),
        acceptanceCriteria: t.acceptanceCriteria.filter((c) => c.trim()),
        subtasks: t.subtasks.slice(0, 8).filter((x) => x.title.trim()).map((x) => ({ ...x, estimateHours: clamp(x.estimateHours, 0, 40) })),
      }
    }),
  }))
  for (const s of stories) for (const t of s.tasks) t.dependsOn = t.dependsOn.filter((d) => refs.has(d) && d !== t.ref)
  return stories
}

/** Writes a validated proposal (epics with stories/tasks/subtasks) to the database. */
export async function applyProposal(projectId, proposal, runCtx) {
  const context = await loadContext(projectId)
  const existingEpics = new Map(context.items.filter((i) => i.type === 'epic').map((e) => [e.key, e._id]))
  const count = proposal.epics.reduce((n, e) => n + 1 + e.stories.reduce((m, s) => m + 1 + s.tasks.reduce((k, t) => k + 1 + t.subtasks.length, 0), 0), 0)
  const project = await Project.findByIdAndUpdate(projectId, { $inc: { workItemSeq: count } }, { returnDocument: 'after' })
  let number = project.workItemSeq - count
  const next = () => { number += 1; return { number, key: `${project.key}-${number}` } }
  const baseOrder = context.items.filter((i) => i.type === 'epic').length

  const docs = []
  const epicIds = new Map()
  const base = { project: projectId, source: 'planning_agent', createdByRun: runCtx.run._id }

  proposal.epics.forEach((epic, ei) => {
    const epicId = new mongoose.Types.ObjectId()
    epicIds.set(epic.ref, epicId)
    const epicTasks = epic.stories.flatMap((s) => s.tasks)
    docs.push({
      ...base, _id: epicId, ...next(), type: 'epic', title: epic.name, description: epic.description,
      objective: epic.objective, brdRefs: epic.brdRefs, priority: epic.priority, order: baseOrder + ei,
      estimateHours: epicTasks.reduce((n, t) => n + t.estimateHours, 0), assignment: { state: 'not_required' },
      _dependsOnRefs: epic.dependsOn,
    })
    const taskIds = new Map()
    epic.stories.forEach((story, si) => {
      const storyId = new mongoose.Types.ObjectId()
      docs.push({
        ...base, _id: storyId, ...next(), type: 'story', title: story.title, description: story.description,
        parent: epicId, epic: epicId, brdRefs: story.brdRefs, priority: story.priority, order: si,
        acceptanceCriteria: story.acceptanceCriteria.map((text) => ({ text })),
        estimateHours: story.tasks.reduce((n, t) => n + t.estimateHours, 0), assignment: { state: 'not_required' },
      })
      story.tasks.forEach((task, ti) => {
        const taskId = new mongoose.Types.ObjectId()
        taskIds.set(task.ref, taskId)
        docs.push({
          ...base, _id: taskId, ...next(), type: 'task', title: task.title, description: task.description,
          parent: storyId, epic: epicId, brdRefs: story.brdRefs, priority: task.priority, order: ti,
          requiredRole: task.requiredRole, skills: task.skills, estimateHours: task.estimateHours,
          acceptanceCriteria: task.acceptanceCriteria.map((text) => ({ text })), _dependsOnTaskRefs: task.dependsOn,
          _taskIds: taskIds,
        })
        task.subtasks.forEach((sub, xi) => {
          docs.push({
            ...base, ...next(), type: 'subtask', title: sub.title, parent: taskId, epic: epicId,
            estimateHours: sub.estimateHours, requiredRole: task.requiredRole, order: xi, brdRefs: story.brdRefs,
          })
        })
      })
    })
  })

  // Resolve references now that every item has an id.
  for (const doc of docs) {
    if (doc._dependsOnRefs) {
      doc.dependsOn = doc._dependsOnRefs.map((r) => epicIds.get(r) ?? existingEpics.get(r)).filter(Boolean)
    }
    if (doc._dependsOnTaskRefs) doc.dependsOn = doc._dependsOnTaskRefs.map((r) => doc._taskIds.get(r)).filter(Boolean)
    delete doc._dependsOnRefs
    delete doc._dependsOnTaskRefs
    delete doc._taskIds
  }
  await WorkItem.insertMany(docs)

  for (const doc of docs.filter((d) => d.type === 'epic')) {
    const stories = docs.filter((d) => d.type === 'story' && d.parent === doc._id)
    const tasks = docs.filter((d) => d.type === 'task' && d.epic === doc._id)
    await audit(projectId, {
      agent: 'planning', action: 'create_epic', run: runCtx.run._id,
      inputContext: `BRD requirements ${doc.brdRefs.join(', ') || '(technical enabler)'}`,
      decision: `Created epic ${doc.key} "${doc.title}" with ${stories.length} stories and ${tasks.length} tasks`,
      reason: doc.objective || 'Groups related requirements into one deliverable functional area.',
      entityType: 'WorkItem', entityId: doc._id, entityKey: doc.key, newState: { status: 'todo', priority: doc.priority },
    })
  }
  return { created: docs.length, epics: proposal.epics.length }
}

/**
 * Full planning workflow: BRD → requirements → epics → stories/tasks/subtasks.
 * Returns { status, summary } for the run; scheduling happens afterwards in reconcile().
 */
export async function planProject(projectId, runCtx) {
  let context = await loadContext(projectId)
  const { project, memory } = context
  if (!project.brd?.fileId) throw new Error('Upload a BRD before planning this project.')

  memory.planning.status = 'running'
  await memory.save()

  if (!memory.brd.analyzedAt || String(memory.brd.fileId) !== String(project.brd.fileId)) {
    await analyzeBrdIntoMemory(runCtx, context)
    context = await loadContext(projectId)
  }
  if (context.memory.brd.requirements.length === 0) {
    context.memory.userContext.clarifications.push({
      question: 'The BRD does not contain any requirements I can identify. Can you describe the main features to build?',
      reason: 'Nothing to plan from.', critical: true, askedAt: new Date(),
    })
    context.memory.planning.status = 'awaiting_clarification'
    await context.memory.save()
    return { status: 'awaiting_input', summary: 'Waiting for clarification: no requirements found in the BRD.' }
  }

  const todo = uncoveredRequirements(context.memory, context.items)
  if (todo.length === 0) {
    context.memory.planning.status = 'planned'
    await context.memory.save()
    return { status: 'succeeded', summary: 'Every requirement is already covered by the backlog.', changed: false }
  }

  await runCtx.step(`Planning epics for ${todo.length} requirement(s)`)
  const agent = getAgent('planning')
  const epicPlan = await agent.skills.planEpics(runCtx, { requirements: todo, context })

  const knownIds = new Set(context.memory.brd.requirements.map((r) => r.id))
  const existingTitles = new Set(context.items.filter((i) => i.type === 'epic').map((e) => norm(e.title)))
  const open = context.memory.userContext.clarifications.filter((c) => !c.answer)
  for (const c of epicPlan.clarifications) {
    if (!open.some((o) => norm(o.question) === norm(c.question))) {
      context.memory.userContext.clarifications.push({ ...c, askedAt: new Date() })
    }
  }
  const epics = epicPlan.epics
    .filter((e) => e.name.trim() && !existingTitles.has(norm(e.name)))
    .map((e) => ({ ...e, brdRefs: e.brdRefs.filter((r) => knownIds.has(r)) }))

  if (epics.length === 0 && epicPlan.clarifications.some((c) => c.critical)) {
    context.memory.planning.status = 'awaiting_clarification'
    await context.memory.save()
    return { status: 'awaiting_input', summary: 'Planning paused: the Planning Agent needs answers to critical questions.' }
  }
  await context.memory.save()

  const proposal = { epics: [] }
  for (const [i, epic] of epics.entries()) {
    await runCtx.step(`Breaking down epic ${i + 1} of ${epics.length}: ${epic.name}`)
    const decomposition = await agent.skills.decomposeEpic(runCtx, { epic, context })
    proposal.epics.push({ ...epic, stories: sanitizeDecomposition(decomposition, knownIds) })
  }

  const taskCount = proposal.epics.reduce((n, e) => n + e.stories.reduce((m, s) => m + s.tasks.length, 0), 0)
  const action = context.items.length ? 'change_scope' : 'create_work_items'
  if (policyFor(context.memory, action) === 'approval') {
    await propose(projectId, {
      action: 'apply_plan', proposedBy: 'planning',
      title: `Add ${proposal.epics.length} epic(s) with ${taskCount} tasks to the backlog`,
      summary: proposal.epics.map((e) => `${e.name} (${e.stories.length} stories)`).join('; '),
      reason: `${todo.length} requirement(s) are not covered by the current backlog.`,
      payload: { proposal },
    })
    context.memory.planning.status = 'planned'
    await context.memory.save()
    return { status: 'succeeded', summary: `Plan ready: ${proposal.epics.length} epic(s), ${taskCount} tasks, waiting for your approval.`, changed: false }
  }

  await runCtx.step('Writing the plan to Project Memory')
  const { created } = await applyProposal(projectId, proposal, runCtx)
  context.memory.planning.status = 'planned'
  context.memory.planning.lastPlannedAt = new Date()
  await context.memory.save()
  return { status: 'succeeded', summary: `Created ${proposal.epics.length} epic(s), ${taskCount} tasks (${created} work items in total).`, changed: true }
}

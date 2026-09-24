import { Project } from '../../models/Project.js'
import { ProjectMemory } from '../../models/ProjectMemory.js'
import { Sprint } from '../../models/Sprint.js'
import { TeamMember } from '../../models/TeamMember.js'
import { WorkItem } from '../../models/WorkItem.js'

/**
 * Shared Project Memory. Every agent gets its context from here (never from its own chat history),
 * so all agents always see the same, latest project state.
 */

export async function getMemory(projectId) {
  try {
    return await ProjectMemory.findOneAndUpdate(
      { project: projectId },
      { $setOnInsert: { project: projectId } },
      { upsert: true, returnDocument: 'after' },
    )
  } catch (err) {
    // Two simultaneous first reads can both try to insert; the loser just reads the winner's document.
    if (err.code === 11000) return ProjectMemory.findOne({ project: projectId })
    throw err
  }
}

/** Loads everything an agent or the engine may need, in one consistent read. */
export async function loadContext(projectId) {
  const project = await Project.findById(projectId)
  if (!project) throw new Error('Project not found')
  const [memory, members, items, sprints] = await Promise.all([
    getMemory(projectId),
    TeamMember.find({ owner: project.owner, projects: project._id }).lean(),
    WorkItem.find({ project: projectId }).sort({ number: 1 }).lean(),
    Sprint.find({ project: projectId }).sort({ number: 1 }).lean(),
  ])
  const team = members.map((m) => ({
    ...m,
    status: m.status === 'pending' && m.inviteExpiresAt < new Date() ? 'expired' : m.status,
  }))
  const eligibleTeam = team.filter((m) => m.status === 'active' && m.availability !== 'unavailable')
  return { project, memory, team, eligibleTeam, items, sprints }
}

// ---- Compact text digests used in prompts (small, so agents stay within token budgets) ----

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s ?? '')
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'not set')

export function projectDigest({ project, memory }) {
  const i = memory.info ?? {}
  return [
    `Project: ${project.name} (key ${project.key}), development model: ${project.model ?? 'not set'}`,
    project.description && `Description: ${clip(project.description, 400)}`,
    i.summary && `Summary: ${clip(i.summary, 600)}`,
    i.objectives?.length && `Objectives: ${i.objectives.map((o) => clip(o, 160)).join('; ')}`,
    i.scope?.length && `In scope: ${i.scope.map((o) => clip(o, 120)).join('; ')}`,
    i.outOfScope?.length && `Out of scope: ${i.outOfScope.map((o) => clip(o, 120)).join('; ')}`,
    i.constraints?.length && `Constraints: ${i.constraints.map((o) => clip(o, 160)).join('; ')}`,
    i.techStack?.length && `Tech stack: ${i.techStack.join(', ')}`,
    `Start date: ${fmtDate(i.startDate)}; deadline: ${fmtDate(i.deadline)}`,
  ].filter(Boolean).join('\n')
}

export function requirementsDigest(requirements, max = 120) {
  return requirements.slice(0, max)
    .map((r) => `${r.id} [${r.type}${r.area ? `, ${r.area}` : ''}] ${clip(r.text, 260)}`)
    .join('\n')
}

export function userContextDigest(memory) {
  const u = memory.userContext ?? {}
  const lines = []
  for (const i of (u.instructions ?? []).slice(-15)) lines.push(`- Instruction: ${clip(i.text, 300)}`)
  for (const c of (u.clarifications ?? []).filter((c) => c.answer).slice(-10)) {
    lines.push(`- Clarification: ${clip(c.question, 200)} → ${clip(c.answer, 300)}`)
  }
  for (const d of (memory.decisions ?? []).slice(-10)) lines.push(`- Decision: ${clip(d.text, 250)}`)
  return lines.length ? lines.join('\n') : '(none)'
}

export function teamDigest(team) {
  if (!team.length) return '(no team members yet)'
  return team.map((m) => `- ${m.name}: ${m.role}; skills: ${m.skills?.join(', ') || 'none listed'}; ${m.capacityHoursPerWeek ?? 30} h/week; ${m.status}${m.availability === 'unavailable' ? ', unavailable' : ''}`).join('\n')
}

export function backlogDigest(items, max = 80) {
  const epics = items.filter((i) => i.type === 'epic')
  if (!epics.length) return '(empty backlog)'
  const lines = []
  for (const e of epics) {
    lines.push(`${e.key} EPIC ${e.title} [${e.status}] refs: ${e.brdRefs.join(', ') || '-'}`)
    for (const s of items.filter((i) => i.type === 'story' && String(i.parent) === String(e._id))) {
      lines.push(`  ${s.key} STORY ${clip(s.title, 120)} [${s.status}]`)
    }
    if (lines.length > max) break
  }
  return lines.join('\n')
}

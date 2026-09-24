import { MEMBER_ROLES } from '../../config/constants.js'
import { arr, bool, chatJSON, num, obj, oneOf, str } from '../llm.js'
import { chunkText } from '../brdText.js'
import {
  backlogDigest, projectDigest, requirementsDigest, teamDigest, userContextDigest,
} from '../memory/projectMemory.js'

/**
 * Planning Agent: turns the BRD, user instructions and project memory into
 * Epics → Stories → Tasks → Subtasks. It only *proposes* work; the Orchestrator validates it,
 * writes it to memory and the deterministic engine schedules and assigns it.
 */

const PRIORITY = oneOf(['Critical', 'High', 'Medium', 'Low'])
const ROLE = oneOf(MEMBER_ROLES)

const RULES = `Rules:
- Only plan work that is traceable to a BRD requirement ID, a user instruction, or a clearly necessary technical dependency (e.g. project setup, CI, database schema). Never invent features.
- Use the exact requirement IDs given (e.g. FR-3) in brdRefs. Use an empty list only for pure technical enablers.
- Be concrete and concise. Titles are short imperative phrases. No filler.`

// ---------------- 1. BRD analysis ----------------

const analysisSchema = obj({
  requirements: arr(obj({
    id: str('The ID written in the document (e.g. FR-1, NFR-2, BR-3). If none, use the given prefix plus a number.'),
    type: oneOf(['functional', 'non_functional', 'business_rule', 'constraint', 'dependency']),
    text: str('The requirement in one or two sentences'),
    area: str('Functional area / module it belongs to, e.g. "Authentication"'),
    acceptanceCriteria: arr(str()),
  })),
  userRoles: arr(str('A user role of the system, e.g. "Customer", "Admin"')),
  workflows: arr(str('A key business workflow in one sentence')),
  summary: str('What the product is, in 2-3 sentences. Empty if this excerpt does not say.'),
  objectives: arr(str()),
  scope: arr(str()),
  outOfScope: arr(str()),
  constraints: arr(str()),
  techStack: arr(str()),
  deadline: str('Project deadline as YYYY-MM-DD if stated, otherwise empty'),
})

async function analyzeChunk(ctx, chunk, index, total) {
  const { data, usage } = await chatJSON({
    tier: 'fast',
    reasoning: 'low',
    maxTokens: 6000,
    schemaName: 'brd_analysis',
    schema: analysisSchema,
    system: `You are a business analyst extracting a structured requirements baseline from a Business Requirements Document (BRD).
Extract every distinct requirement in this excerpt, preserving the document's own requirement IDs. Put acceptance criteria stated in the document on the matching requirement.
Do not invent requirements that are not in the text. If an ID is missing, use the prefix "R${index + 1}-" plus a number.`,
    user: `BRD excerpt ${index + 1} of ${total}:\n"""\n${chunk}\n"""`,
  })
  ctx.usage(usage)
  return data
}

export async function analyzeBrd(ctx, text) {
  const chunks = chunkText(text)
  const merged = {
    requirements: [], userRoles: new Set(), workflows: new Set(), summary: '', objectives: new Set(),
    scope: new Set(), outOfScope: new Set(), constraints: new Set(), techStack: new Set(), deadline: '',
  }
  const seen = new Map()
  for (const [i, chunk] of chunks.entries()) {
    await ctx.step(`Reading BRD section ${i + 1} of ${chunks.length}`)
    const part = await analyzeChunk(ctx, chunk, i, chunks.length)
    for (const r of part.requirements) {
      if (!r.text?.trim()) continue
      let id = r.id.trim().toUpperCase().replace(/\s+/g, '-') || `R-${merged.requirements.length + 1}`
      // The same ID appearing in two chunks with different text gets a suffix instead of being lost.
      if (seen.has(id) && seen.get(id) !== r.text) id = `${id}.${merged.requirements.length + 1}`
      if (seen.has(id)) continue
      seen.set(id, r.text)
      merged.requirements.push({ ...r, id, source: 'brd' })
    }
    for (const k of ['userRoles', 'workflows', 'objectives', 'scope', 'outOfScope', 'constraints', 'techStack']) {
      for (const v of part[k]) if (v?.trim()) merged[k].add(v.trim())
    }
    merged.summary ||= part.summary
    merged.deadline ||= /^\d{4}-\d{2}-\d{2}$/.test(part.deadline) ? part.deadline : ''
  }
  const toArr = (s) => [...s]
  return {
    ...merged,
    userRoles: toArr(merged.userRoles), workflows: toArr(merged.workflows), objectives: toArr(merged.objectives),
    scope: toArr(merged.scope), outOfScope: toArr(merged.outOfScope), constraints: toArr(merged.constraints),
    techStack: toArr(merged.techStack), chunks: chunks.length,
  }
}

// ---------------- 2. Epic planning ----------------

const epicPlanSchema = obj({
  epics: arr(obj({
    ref: str('Short reference for this new epic, e.g. E1'),
    name: str(),
    description: str(),
    objective: str('Business objective this epic delivers'),
    brdRefs: arr(str('Requirement ID')),
    priority: PRIORITY,
    dependsOn: arr(str('ref of another new epic, or key of an existing epic, that must be finished first')),
    estimateDays: num('Rough effort in person-days'),
  })),
  clarifications: arr(obj({
    question: str(),
    reason: str('Why planning needs this answer'),
    critical: bool('True only if a sensible plan is impossible without the answer'),
  })),
})

export async function planEpics(ctx, { requirements, context }) {
  const existing = context.items.filter((i) => i.type === 'epic')
  const { data, usage } = await chatJSON({
    tier: 'planner',
    reasoning: 'medium',
    maxTokens: 6000,
    schemaName: 'epic_plan',
    schema: epicPlanSchema,
    system: `You are a senior delivery lead planning a software project. Group the requirements into Epics: large functional areas that each deliver a business objective.
${RULES}
- Size the plan to the project. An epic groups several related requirements; a typical BRD yields 3 to 7 epics. Never create one epic per requirement.
- Cover every requirement listed under "Requirements to plan" across the epics (non-functional requirements may be referenced by several epics).
- Add a dependency only when an epic truly cannot start until another is built (typically: everything depends on a foundation/setup epic). Keep independent epics parallel so the team can work on them at the same time.
- Do not re-create an existing epic. If new requirements belong to an existing epic, still create a new epic only when they form a distinct functional area; otherwise put them in a new epic named after the extension.
- Order epics by delivery sequence and mark real dependencies (e.g. authentication before payments).
- Ask clarifications only for critical, blocking ambiguity. Most BRDs need none.`,
    user: `${projectDigest(context)}

User instructions and decisions:
${userContextDigest(context.memory)}

Existing backlog:
${backlogDigest(context.items)}

Requirements to plan:
${requirementsDigest(requirements)}

Other requirements (context only):
${requirementsDigest(context.memory.brd.requirements.filter((r) => !requirements.includes(r) && r.type !== 'functional'), 40) || '(none)'}

Existing epic keys: ${existing.map((e) => `${e.key} (${e.title})`).join(', ') || 'none'}`,
  })
  ctx.usage(usage)
  return data
}

// ---------------- 3. Epic decomposition ----------------

const decompositionSchema = obj({
  stories: arr(obj({
    ref: str('e.g. S1'),
    title: str('User story, e.g. "Customer can log in with email and password"'),
    description: str(),
    brdRefs: arr(str()),
    priority: PRIORITY,
    acceptanceCriteria: arr(str()),
    tasks: arr(obj({
      ref: str('e.g. T1, unique within this epic'),
      title: str(),
      description: str(),
      requiredRole: ROLE,
      skills: arr(str('lowercase skill keyword, e.g. "react", "node", "mongodb"')),
      estimateHours: num('Realistic effort in hours, between 2 and 40'),
      priority: PRIORITY,
      acceptanceCriteria: arr(str()),
      dependsOn: arr(str('ref of another task in this epic that must be done first')),
      subtasks: arr(obj({ title: str(), estimateHours: num() })),
    })),
  })),
})

export async function decomposeEpic(ctx, { epic, context }) {
  const reqIds = new Set(epic.brdRefs)
  const related = context.memory.brd.requirements.filter((r) => reqIds.has(r.id))
  const nfr = context.memory.brd.requirements.filter((r) => r.type === 'non_functional' || r.type === 'constraint')
  const { data, usage } = await chatJSON({
    tier: 'planner',
    reasoning: 'low',
    maxTokens: 7000,
    schemaName: 'epic_decomposition',
    schema: decompositionSchema,
    system: `You break an Epic into User Stories, Tasks and Subtasks for a ${context.project.model ?? 'agile'} team.
${RULES}
- Size the breakdown to the epic's real scope: 1 to 4 stories, 2 to 4 tasks per story, 0 to 5 subtasks per task (only for tasks bigger than about 8 hours).
- Every task needs a single requiredRole from the allowed list, testable acceptance criteria, and a realistic estimate in hours.
- Prefer roles that exist in the team listed below. Use another role only when the work genuinely needs that specialism (e.g. dedicated QA testing, infrastructure/DevOps, visual design).
- Developers write their own unit tests inside their tasks. Add at most one QA task per story, only for end-to-end or acceptance testing.
- Do not create project-management overhead tasks (meetings, planning, reviews, sign-offs, documentation of the plan).
- Subtasks must be specific to their task and technically correct for the stated tech stack.
- dependsOn must reference task refs from this same response, only when one task truly cannot start before another finishes.`,
    user: `${projectDigest(context)}

Team (for realistic roles and skills):
${teamDigest(context.team)}

User instructions and decisions:
${userContextDigest(context.memory)}

Epic ${epic.ref ?? epic.key}: ${epic.name ?? epic.title}
Description: ${epic.description ?? ''}
Objective: ${epic.objective ?? ''}

Requirements covered by this epic:
${requirementsDigest(related) || '(technical enabler: no direct BRD requirement)'}

Non-functional requirements and constraints to respect:
${requirementsDigest(nfr, 20) || '(none)'}`,
  })
  ctx.usage(usage)
  return data
}

export const planningAgent = {
  name: 'planning',
  label: 'Planning Agent',
  description: 'Converts the BRD and user context into epics, stories, tasks and subtasks.',
  skills: { analyzeBrd, planEpics, decomposeEpic },
}

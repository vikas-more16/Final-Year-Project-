import { arr, chatJSON, obj, oneOf, str } from '../llm.js'
import { backlogDigest, projectDigest, teamDigest, userContextDigest } from '../memory/projectMemory.js'

/**
 * The Orchestrator's own LLM skills: understanding a user request (intent routing) and answering
 * questions from Project Memory. Everything else it delegates to specialised agents.
 */

export const INTENTS = [
  'plan_project', 'add_requirements', 'change_deadline', 'set_start_date', 'add_instruction',
  'answer_clarification', 'reschedule', 'question', 'other',
]

const routeSchema = obj({
  intent: oneOf(INTENTS),
  requirements: arr(obj({ text: str(), type: oneOf(['functional', 'non_functional', 'business_rule', 'constraint']) })),
  date: str('YYYY-MM-DD for change_deadline / set_start_date, otherwise empty'),
  instruction: str('For add_instruction: the instruction restated as one clear sentence, otherwise empty'),
  clarificationAnswers: arr(obj({ number: str('Clarification number from the list'), answer: str() })),
})

export async function routeRequest(ctx, { text, context, openClarifications }) {
  const today = new Date().toISOString().slice(0, 10)
  const { data, usage } = await chatJSON({
    tier: 'fast',
    reasoning: 'low',
    maxTokens: 2000,
    schemaName: 'route',
    schema: routeSchema,
    system: `You are the Orchestrator of an AI project-management system. Classify the manager's message into one intent and extract its details. Today is ${today}.
Intents:
- plan_project: generate, regenerate or continue the project plan/backlog from the BRD.
- add_requirements: the message adds new features or requirements to build.
- change_deadline: change the project deadline (resolve relative dates to YYYY-MM-DD).
- set_start_date: change when the project starts.
- add_instruction: a preference, constraint, tech-stack choice or planning rule to remember (e.g. "use PostgreSQL", "sprints of 1 week", "Yash only does frontend").
- answer_clarification: answers one of the open clarification questions.
- reschedule: re-run assignment/scheduling, e.g. "assign the vacant tasks", "rebalance workload".
- question: asks about the project status, plan, team, risks or tasks.
- other: anything else.`,
    user: `Open clarification questions:
${openClarifications.map((c, i) => `${i + 1}. ${c.question}`).join('\n') || '(none)'}

${projectDigest(context)}

Manager's message:
"""${text}"""`,
  })
  ctx.usage(usage)
  return data
}

export async function answerQuestion(ctx, { text, context, facts }) {
  const { data, usage } = await chatJSON({
    tier: 'fast',
    reasoning: 'low',
    maxTokens: 2500,
    schemaName: 'answer',
    schema: obj({ answer: str('Concise answer in plain text, using only the facts provided') }),
    system: 'You are the Orchestrator of an AI project-management system. Answer the manager using only the project facts given. If the facts do not contain the answer, say so. Be concise and specific (cite task keys, dates, names).',
    user: `${projectDigest(context)}

Team:
${teamDigest(context.team)}

Backlog:
${backlogDigest(context.items, 60)}

Current state:
${facts}

User context:
${userContextDigest(context.memory)}

Question: ${text}`,
  })
  ctx.usage(usage)
  return data.answer
}

export const orchestratorAgent = {
  name: 'orchestrator',
  label: 'Orchestrator Agent',
  description: 'Understands requests, routes them to agents, validates output and keeps Project Memory consistent.',
  skills: { routeRequest, answerQuestion },
}

import { orchestratorAgent } from './orchestratorAgent.js'
import { planningAgent } from './planningAgent.js'

/**
 * Agent registry. New specialised agents (monitoring, reporting, QA...) register here with their
 * skills; the Orchestrator looks them up by name, so adding one does not change the core.
 */
const agents = new Map()

export function registerAgent(agent) {
  if (!agent.name || !agent.skills) throw new Error('An agent needs a name and skills')
  agents.set(agent.name, agent)
}

export function getAgent(name) {
  const agent = agents.get(name)
  if (!agent) throw new Error(`Unknown agent: ${name}`)
  return agent
}

export const listAgents = () => [...agents.values()].map(({ name, label, description }) => ({ name, label, description }))

registerAgent(orchestratorAgent)
registerAgent(planningAgent)

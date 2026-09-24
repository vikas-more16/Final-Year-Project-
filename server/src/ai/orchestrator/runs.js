import { AgentRun } from '../../models/AgentRun.js'

/**
 * Per-project serial queue: every workflow for a project runs one at a time, so two agents
 * never write conflicting changes to the same Project Memory. Identical queued jobs are merged.
 */
const queues = new Map() // projectId -> { tail: Promise, pending: Map<dedupeKey, Promise> }

export function enqueue(projectId, dedupeKey, job) {
  const key = String(projectId)
  if (!queues.has(key)) queues.set(key, { tail: Promise.resolve(), pending: new Map() })
  const q = queues.get(key)
  if (dedupeKey && q.pending.has(dedupeKey)) return q.pending.get(dedupeKey)
  const promise = q.tail.then(() => {
    if (dedupeKey) q.pending.delete(dedupeKey)
    return job()
  })
  q.tail = promise.catch(() => {})
  if (dedupeKey) q.pending.set(dedupeKey, promise)
  return promise
}

/** Tracks one agent run so the UI can show live progress, usage and failures. */
export async function startRun(projectId, { agent, action, trigger }) {
  const run = await AgentRun.create({ project: projectId, agent, action, trigger, status: 'running', startedAt: new Date() })
  const ctx = {
    run,
    async step(message) {
      run.steps.push({ at: new Date(), message })
      await run.save()
    },
    usage(tokens) {
      run.llm.calls += 1
      run.llm.tokens += tokens || 0
    },
    async finish(status, summary) {
      run.status = status
      run.summary = summary
      run.finishedAt = new Date()
      await run.save()
    },
    async fail(err) {
      run.status = 'failed'
      run.error = err.message
      run.finishedAt = new Date()
      await run.save()
    },
  }
  return ctx
}

/** Runs left "running" by a server restart can never finish; mark them failed on boot. */
export async function recoverStaleRuns() {
  const res = await AgentRun.updateMany(
    { status: { $in: ['queued', 'running'] } },
    { $set: { status: 'failed', error: 'Interrupted by a server restart. Run it again.', finishedAt: new Date() } },
  )
  return res.modifiedCount
}

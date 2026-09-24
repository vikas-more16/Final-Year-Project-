// Thin client for the orchestrator service. Copy into src/. Base URL: VITE_ORCH_URL or http://localhost:8000
const BASE = import.meta.env?.VITE_ORCH_URL ?? 'http://localhost:8000'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail || detail } catch { /* not JSON */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return res.json()
}

export const getSdlcModels = () => request('/sdlc-models')
export const getDomains = () => request('/domains')
export const createProject = (project) => request('/projects', { method: 'POST', body: JSON.stringify(project) })
export const getProject = (id) => request(`/projects/${id}`)
export const getMyTasks = (id, email) => request(`/projects/${id}/tasks?assignee=${encodeURIComponent(email)}`)
export const updateTask = (id, taskId, status, actor) =>
  request(`/projects/${id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status, actor }) })
export const chat = (id, message) => request(`/projects/${id}/chat`, { method: 'POST', body: JSON.stringify({ message }) })

export const STAGE_LABELS = {
  queued: 'Starting the orchestrator...',
  requirement: 'Requirement agent is analysing the project...',
  planning: 'Planning agent is building the phase plan...',
  task: 'Task agent is breaking the plan into tasks...',
  allocation: 'Orchestrator is allocating tasks to members...',
  monitoring: 'Monitoring agent is checking the baseline...',
  reporting: 'Reporting agent is writing the kickoff report...',
  done: 'Done',
}

// Leader picks the SDLC model -> orchestrator runs. Resolves with the finished project.
// onProgress(stage, project) is called on every poll so the UI can show which agent is working.
export async function startProject(id, sdlcModel, requestedBy, onProgress, intervalMs = 2000) {
  await request(`/projects/${id}/start-async`, {
    method: 'POST', body: JSON.stringify({ sdlc_model: sdlcModel, requested_by: requestedBy }),
  })
  for (;;) {
    await new Promise((r) => setTimeout(r, intervalMs))
    const p = await getProject(id)
    onProgress?.(p.stage, p)
    if (p.stage === 'done') return p
    if (p.stage === 'failed' || p.status === 'failed') throw new Error(p.error || 'Orchestration failed')
  }
}

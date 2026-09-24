import { useEffect, useState } from 'react'
import { STAGE_LABELS, chat, createProject, getDomains, getProject, getSdlcModels, startProject, updateTask } from './orchestratorApi'

const box = { border: '1px solid #d0d7e2', borderRadius: 8, padding: 16, margin: '16px 0', textAlign: 'left' }
const input = { display: 'block', width: '100%', boxSizing: 'border-box', margin: '4px 0 12px', padding: 8 }
const STATUSES = ['todo', 'in_progress', 'blocked', 'done']

export default function OrchestratorPanel({ organizationName = '', ownerEmail = 'leader@example.com', members = [] }) {
  const [models, setModels] = useState([])
  const [domains, setDomains] = useState([])
  const [form, setForm] = useState({ name: organizationName, description: '', mission: '', vision: '', objective: '', tech_stack: '', documents: '' })
  const [model, setModel] = useState('waterfall')
  const [team, setTeam] = useState(() => [
    { email: ownerEmail, role: 'Admin', domains: [] },
    ...members.map((m) => ({ email: m.email, role: m.role, domains: m.domains || [] })),
  ])
  const [project, setProject] = useState(null)
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [answer, setAnswer] = useState(null)

  useEffect(() => {
    getSdlcModels().then(setModels).catch((e) => setError(e.message))
    getDomains().then(setDomains).catch(() => {})
  }, [])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const toggleDomain = (i, key) => setTeam(team.map((m, idx) => idx !== i ? m
    : { ...m, domains: m.domains.includes(key) ? m.domains.filter((d) => d !== key) : [...m.domains, key] }))

  const start = async () => {
    setError(''); setStage('queued')
    try {
      const created = await createProject({ ...form, members: team })
      setProject(await startProject(created.id, model, ownerEmail, (s) => setStage(s)))
      setStage('done')
    } catch (e) { setError(e.message); setStage('') }
  }
  const refresh = async () => setProject(await getProject(project.id))
  const setStatus = async (taskId, status) => {
    try { await updateTask(project.id, taskId, status, ownerEmail); await refresh() } catch (e) { setError(e.message) }
  }
  const ask = async () => {
    try { setAnswer(await chat(project.id, message)); setMessage(''); await refresh() } catch (e) { setError(e.message) }
  }

  const running = stage && stage !== 'done'
  return (
    <div>
      {error && <p role="alert" style={{ color: '#b00020' }}>{error}</p>}

      {!project && (
        <div style={box}>
          <h3>1. Project details</h3>
          <label>Project name<input style={input} value={form.name} onChange={set('name')} /></label>
          <label>Description<textarea style={input} rows={3} value={form.description} onChange={set('description')} /></label>
          <label>Mission<input style={input} value={form.mission} onChange={set('mission')} /></label>
          <label>Vision<input style={input} value={form.vision} onChange={set('vision')} /></label>
          <label>Objective<input style={input} value={form.objective} onChange={set('objective')} /></label>
          <label>Tech stack<input style={input} value={form.tech_stack} onChange={set('tech_stack')} placeholder="e.g. React, FastAPI, SQLite" /></label>
          <label>Extra documents (paste BRD / work order text)<textarea style={input} rows={4} value={form.documents} onChange={set('documents')} /></label>

          <h3>2. Team domains</h3>
          {team.map((m, i) => (
            <div key={m.email + i} style={{ marginBottom: 8 }}>
              <strong>{m.email}</strong> <small>({m.role})</small><br />
              {domains.map((d) => (
                <label key={d.key} style={{ marginRight: 10, fontSize: 13 }}>
                  <input type="checkbox" checked={m.domains.includes(d.key)} onChange={() => toggleDomain(i, d.key)} /> {d.label}
                </label>
              ))}
            </div>
          ))}

          <h3>3. Select SDLC model</h3>
          <select style={input} value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => <option key={m.key} value={m.key}>{m.label}: {m.phases.join(' > ')}</option>)}
          </select>
          <button type="button" disabled={running || !form.name.trim()} onClick={start}>Start project with the orchestrator</button>
          {running && <p>{STAGE_LABELS[stage] || stage} (this takes up to a minute with a real LLM)</p>}
        </div>
      )}

      {project && (
        <>
          <div style={box}>
            <h3>{project.name} <small>({project.sdlc_model}, {project.status})</small></h3>
            <p>Current phase: <strong>{project.current_phase || '-'}</strong> | Progress: <strong>{project.monitoring.progress_pct}%</strong> | Health: <strong>{project.monitoring.health}</strong></p>
            {project.monitoring.flags?.map((f) => <p key={f} style={{ color: '#b00020' }}>! {f}</p>)}
            {project.assignments.map((a) => <div key={a.email}>{a.name}: <strong>{a.project_role}</strong>, {a.task_count} tasks, {a.open_hours}h open</div>)}
          </div>

          {project.phases.map((ph) => (
            <div style={box} key={ph.name}>
              <h4>{ph.name} <small>({ph.start_date} to {ph.end_date})</small></h4>
              {project.tasks.filter((t) => t.phase === ph.name).map((t) => (
                <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ flex: 1 }}>{t.id} {t.title} <small>[{t.domain}, {t.estimate_hours}h] {t.assignee}</small></span>
                  {t.status === 'locked' ? <em>locked</em>
                    : <select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>}
                </div>
              ))}
            </div>
          ))}

          <div style={box}>
            <h4>Ask the orchestrator</h4>
            <input style={input} value={message} onChange={(e) => setMessage(e.target.value)} placeholder='e.g. "Vikas is on leave, reassign his work" or "give me a report"' />
            <button type="button" disabled={!message.trim()} onClick={ask}>Send</button>
            {answer && <pre style={{ whiteSpace: 'pre-wrap' }}>{answer.report || answer.message || JSON.stringify(answer, null, 2)}</pre>}
          </div>

          <details style={box}>
            <summary>Agent messages ({project.events.length})</summary>
            {project.events.slice(-25).map((e, i) => <div key={i}><small>{e.sender} to {e.receiver}: {e.message}</small></div>)}
          </details>
          <details style={box}><summary>Latest report</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{project.report}</pre></details>
        </>
      )}
    </div>
  )
}

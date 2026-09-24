import { AlertTriangle, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrdRow } from '../../components/BrdRow'
import { useWorkItems } from '../../hooks/useWorkItems'
import { api } from '../../lib/api'
import { initials } from '../../lib/format'
import { fmtDate, isBlocked, isVacant } from '../../lib/workItems'

const PLAN_TEXT = {
  idle: 'The Planning Agent has not planned this project yet.',
  running: 'The Planning Agent is planning this project right now.',
  awaiting_clarification: 'The Planning Agent is waiting for your answers.',
  planned: 'The project is planned and the Orchestrator keeps it up to date.',
  failed: 'The last planning run failed. Open the AI Orchestrator for details.',
}

export default function ProjectSummary({ project, members, models, setProject }) {
  const [error, setError] = useState('')
  const [ai, setAi] = useState(null)
  const { data } = useWorkItems(project.id)
  const model = models.find((m) => m.id === project.model)

  useEffect(() => {
    let cancelled = false
    api(`/projects/${project.id}/ai`).then((s) => { if (!cancelled) setAi(s) }).catch(() => {})
    return () => { cancelled = true }
  }, [project.id])

  const tasks = data?.items.filter((i) => i.type === 'task') ?? []
  const count = (fn) => tasks.filter(fn).length
  const active = members.filter((m) => m.status === 'active')
  const risk = ai?.memory.planning.scheduleRisk
  const nextUp = tasks.filter((t) => t.status !== 'done' && !isBlocked(t)).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 5)
  const memberName = new Map((data?.members ?? []).map((m) => [m.id, m.name]))

  return (
    <div className="summary">
      <div className="stat-row stat-row-6">
        <div className="stat"><strong>{tasks.length}</strong><span>Tasks</span></div>
        <div className="stat"><strong>{count((t) => t.status === 'done')}</strong><span>Completed</span></div>
        <div className="stat"><strong>{count((t) => t.status === 'in_progress' || t.status === 'in_review')}</strong><span>In progress</span></div>
        <div className="stat"><strong>{count(isBlocked)}</strong><span>Blocked</span></div>
        <div className="stat"><strong>{count(isVacant)}</strong><span>Pending assignment</span></div>
        <div className="stat"><strong>{active.length}</strong><span>Active members</span></div>
      </div>

      {risk && (
        <div className="banner banner-risk"><AlertTriangle size={18} />
          <div><strong>⚠️ Schedule risk: {risk.differenceDays} day(s) late</strong>
            <span>Estimated completion {fmtDate(risk.estimatedCompletion, { dateStyle: 'long' })}, deadline {fmtDate(risk.deadline, { dateStyle: 'long' })}. {risk.reasons.join(' ')}</span></div>
        </div>
      )}
      {error && <div className="form-alert" role="alert">{error}</div>}

      <div className="summary-grid">
        <section className="card">
          <h2>About this project</h2>
          <p className="card-text">{ai?.memory.info.summary || project.description || <span className="muted">No description yet.</span>}</p>
          <dl className="facts">
            <div><dt>Key</dt><dd><span className="key-badge">{project.key}</span></dd></div>
            <div><dt>Model</dt><dd>{project.model ? <><b>{project.model}</b><small>{model?.description}</small></> : <span className="muted">Not set</span>}</dd></div>
            <div><dt>Deadline</dt><dd>{fmtDate(ai?.memory.info.deadline, { dateStyle: 'long' })}</dd></div>
            <div><dt>Created</dt><dd>{new Date(project.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</dd></div>
          </dl>
        </section>

        <section className="card">
          <div className="card-head">
            <h2><Sparkles size={16} /> AI planning</h2>
            <Link to={`/projects/${project.id}/ai`}>Open Orchestrator</Link>
          </div>
          <p className="card-text">{ai ? PLAN_TEXT[ai.memory.planning.status] : 'Loading…'}</p>
          {ai?.pending.length > 0 && <p className="card-text"><b>{ai.pending.length} change(s) waiting for your approval.</b></p>}
          <BrdRow project={project} onReplaced={(updated) => { setError(''); setProject(updated) }} onError={setError} />
          {ai && <p className="card-text small-note">{ai.memory.brd.requirements.length} requirements in Project Memory · {data?.sprints.length ?? 0} sprints planned</p>}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Team <span className="count">{members.length}</span></h2>
            <Link to="/team">Manage</Link>
          </div>
          {members.length === 0 ? (
            <p className="card-text">Nobody is assigned yet. Add people to this project from the <Link to="/team">Team</Link> tab.</p>
          ) : (
            <ul className="mini-members">
              {members.map((m) => (
                <li key={m.id}>
                  <span className={`avatar avatar-${m.status}`}>{initials(m.name)}</span>
                  <span className="member-id"><strong>{m.name}</strong><small>{m.role}</small></span>
                  <span className={`status status-${m.status}`}>{m.status[0].toUpperCase() + m.status.slice(1)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Up next</h2>
            <Link to={`/projects/${project.id}/board`}>Board</Link>
          </div>
          {nextUp.length === 0 ? <p className="card-text">No actionable tasks yet.</p> : (
            <ul className="next-list">
              {nextUp.map((t) => (
                <li key={t._id}>
                  <Link to={`/projects/${project.id}/board?task=${t.key}`}><span className="key-badge">{t.key}</span> {t.title}</Link>
                  <small>{memberName.get(t.assignee) ?? `⚠️ ${t.requiredRole} required`} · due {fmtDate(t.dueDate)}</small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

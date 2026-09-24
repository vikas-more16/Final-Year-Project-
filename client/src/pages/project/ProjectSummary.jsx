import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrdRow } from '../../components/BrdRow'
import { initials } from '../../lib/format'

const AGENTS = [
  { name: 'Requirement Analyst', job: 'Extract requirements from the BRD' },
  { name: 'Project Planner', job: 'Build epics, sprints and a timeline' },
  { name: 'Task Allocator', job: 'Assign tasks by skill and workload' },
  { name: 'Progress Monitor', job: 'Track the board and flag delays' },
  { name: 'Report Writer', job: 'Write status and sprint reports' },
]

export default function ProjectSummary({ project, members, models, setProject }) {
  const [error, setError] = useState('')
  const model = models.find((m) => m.id === project.model)
  const active = members.filter((m) => m.status === 'active')
  const pending = members.length - active.length

  return (
    <div className="summary">
      <div className="stat-row">
        <div className="stat"><strong>0</strong><span>Tasks</span></div>
        <div className="stat"><strong>0</strong><span>Completed</span></div>
        <div className="stat"><strong>{active.length}</strong><span>Active members</span></div>
        <div className="stat"><strong>{pending}</strong><span>Pending invites</span></div>
      </div>

      {error && <div className="form-alert" role="alert">{error}</div>}

      <div className="summary-grid">
        <section className="card">
          <h2>About this project</h2>
          <p className="card-text">{project.description || <span className="muted">No description yet.</span>}</p>
          <dl className="facts">
            <div><dt>Key</dt><dd><span className="key-badge">{project.key}</span></dd></div>
            <div><dt>Model</dt><dd>{project.model ? <><b>{project.model}</b><small>{model?.description}</small></> : <span className="muted">Not set</span>}</dd></div>
            <div><dt>Created</dt><dd>{new Date(project.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</dd></div>
          </dl>
        </section>

        <section className="card">
          <h2>Business Requirements Document</h2>
          <p className="card-text">The source the AI agents plan this project from.</p>
          <BrdRow project={project} onReplaced={(updated) => { setError(''); setProject(updated) }} onError={setError} />
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
          <h2>AI agents</h2>
          <p className="card-text">Once connected, these agents turn the BRD into a running plan.</p>
          <ol className="agent-steps">
            {AGENTS.map((a) => (
              <li key={a.name}>
                <span className="agent-dot" />
                <span><strong>{a.name}</strong><small>{a.job}</small></span>
                <span className="agent-state">{project.brd ? 'Ready' : 'Needs BRD'}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}

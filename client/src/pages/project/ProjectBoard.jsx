import { AlertTriangle, Lock, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TaskDrawer } from '../../components/TaskDrawer'
import { useWorkItems } from '../../hooks/useWorkItems'
import { api } from '../../lib/api'
import { initials } from '../../lib/format'
import { STATUSES, fmtDate, indexWorkItems, isBlocked, isVacant } from '../../lib/workItems'

function TaskCard({ task, epic, member, onOpen, onDragStart }) {
  const blocked = isBlocked(task)
  const vacant = isVacant(task)
  return (
    <button type="button" className={`task-card${blocked ? ' is-blocked' : ''}`} draggable onDragStart={onDragStart} onClick={onOpen}>
      <span className="task-card-title">{task.title}</span>
      {epic && <span className="epic-chip" title={epic.title}>{epic.title}</span>}
      {vacant && <span className="vacant-line"><AlertTriangle size={13} /> {task.requiredRole} required</span>}
      <span className="task-card-foot">
        <span className={`priority-dot priority-${task.priority}`} title={`${task.priority} priority`} />
        <span className="key-text">{task.key}</span>
        {blocked && <Lock size={13} className="lock" aria-label="Blocked" />}
        <span className="due">{fmtDate(task.dueDate)}</span>
        {member
          ? <span className="avatar avatar-active" title={member.name}>{initials(member.name)}</span>
          : <span className="avatar avatar-vacant" title="Unassigned">?</span>}
      </span>
    </button>
  )
}

export default function ProjectBoard({ project }) {
  const { data, error, loading, reload } = useWorkItems(project.id)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [sprintFilter, setSprintFilter] = useState(null) // null = default (active sprint)
  // A ref, not state: `drop` can fire before a state update from `dragstart` has rendered.
  const dragKey = useRef(null)
  const [overCol, setOverCol] = useState(null)
  const [toast, setToast] = useState('')
  const [verifyKey, setVerifyKey] = useState(null)
  const openKey = params.get('task')

  const view = useMemo(() => {
    if (!data) return null
    const idx = indexWorkItems(data.items)
    const members = new Map(data.members.map((m) => [m.id, m]))
    const active = data.sprints.find((s) => s.status === 'active') ?? data.sprints.find((s) => s.status === 'planned')
    return { ...idx, members, active }
  }, [data])

  const openTask = (key, verify = false) => {
    setVerifyKey(verify ? key : null)
    setParams((p) => { p.set('task', key); return p })
  }
  const closeTask = () => { setVerifyKey(null); setParams((p) => { p.delete('task'); return p }) }

  async function drop(status) {
    const task = view.tasks.find((t) => t.key === dragKey.current)
    setOverCol(null)
    dragKey.current = null
    if (!task || task.status === status) return
    if (status === 'done' && task.acceptanceCount > 0) return openTask(task.key, true)
    try {
      const res = await api(`/projects/${project.id}/work-items/${task.key}/status`, { method: 'PATCH', body: { status } })
      setToast(res.unblocked?.length ? `${task.key} moved. Now actionable: ${res.unblocked.join(', ')}` : '')
      reload()
    } catch (err) {
      setToast(err.message)
    }
  }

  if (loading) return <div className="panel-state"><span className="spinner" /> Loading board…</div>
  if (error) return <div className="form-alert">{error}</div>

  if (view.tasks.length === 0) {
    return (
      <div className="board-empty-state">
        <h2>No work items yet</h2>
        <p>The Planning Agent turns the BRD into epics, stories and tasks, then assigns them to your team.</p>
        <Link className="btn-primary link-btn" to={`/projects/${project.id}/ai`}>Open the AI Orchestrator</Link>
      </div>
    )
  }

  const sprintId = sprintFilter ?? view.active?._id ?? 'all'
  const q = query.trim().toLowerCase()
  const visible = view.tasks.filter((t) => (sprintId === 'all' || t.sprint === sprintId)
    && (!q || t.title.toLowerCase().includes(q) || t.key.toLowerCase().includes(q)))
  const activeMembers = data.members.filter((m) => m.status === 'active')
  const sprint = data.sprints.find((s) => s._id === sprintId)

  return (
    <>
      <div className="board-toolbar">
        <label className="board-search">
          <Search size={15} />
          <input type="search" placeholder="Search board" aria-label="Search board" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="avatar-stack" aria-label={`${activeMembers.length} active members`}>
          {activeMembers.slice(0, 6).map((m) => <span key={m.id} className="avatar avatar-active" title={`${m.name} · ${m.role}`}>{initials(m.name)}</span>)}
        </div>
        <select className="text-input sprint-select" value={sprintId} onChange={(e) => setSprintFilter(e.target.value)} aria-label="Sprint">
          {data.sprints.map((s) => <option key={s._id} value={s._id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}
          <option value="all">All sprints</option>
        </select>
      </div>
      {sprint && (
        <p className="sprint-line"><strong>{sprint.name}</strong> · {fmtDate(sprint.startDate)} – {fmtDate(sprint.endDate)} · {sprint.goal}</p>
      )}
      {toast && <div className="notice notice-warn" role="status"><div><strong>{toast}</strong></div><button type="button" className="icon-button" onClick={() => setToast('')}>×</button></div>}

      <div className="board">
        {STATUSES.map((col) => {
          const cards = visible.filter((t) => t.status === col.id)
          return (
            <section key={col.id} className={`board-col${overCol === col.id ? ' drop-target' : ''}`} aria-label={col.label}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col.id) }} onDragLeave={() => setOverCol(null)} onDrop={() => drop(col.id)}>
              <h3>{col.label} <span>{cards.length}</span></h3>
              <div className="board-cards">
                {cards.map((t) => (
                  <TaskCard key={t._id} task={t} epic={view.byId.get(t.epic)} member={view.members.get(t.assignee)}
                    onOpen={() => openTask(t.key)} onDragStart={() => { dragKey.current = t.key }} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      {openKey && (
        <TaskDrawer projectId={project.id} itemKey={openKey} startVerify={verifyKey === openKey}
          onClose={closeTask} onOpen={(k) => openTask(k)} onChanged={reload} />
      )}
    </>
  )
}

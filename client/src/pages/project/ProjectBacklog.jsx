import { AlertTriangle, ChevronDown, ChevronRight, Lock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TaskDrawer } from '../../components/TaskDrawer'
import { useWorkItems } from '../../hooks/useWorkItems'
import { initials } from '../../lib/format'
import { STATUS_LABEL, fmtDate, fmtHours, indexWorkItems, isBlocked, isVacant } from '../../lib/workItems'

function Row({ item, depth = 0, member, epic, onOpen, toggle, expanded }) {
  const blocked = isBlocked(item)
  const vacant = isVacant(item)
  return (
    <div className={`bl-row bl-${item.type}`} style={{ '--depth': depth }}>
      {toggle ? (
        <button type="button" className="bl-toggle" onClick={toggle} aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
      ) : <span className="bl-toggle" />}
      <span className={`type-mark type-${item.type}`} title={item.type}>{item.type[0].toUpperCase()}</span>
      <button type="button" className="bl-title" onClick={() => onOpen(item.key)}>
        <span className="key-text">{item.key}</span> {item.title}
      </button>
      {epic && <span className="epic-chip" title={epic.title}>{epic.title}</span>}
      {blocked && <Lock size={13} className="lock" aria-label="Blocked" />}
      {vacant && <span className="vacant-chip" title={item.assignment.reason}><AlertTriangle size={12} /> {item.requiredRole}</span>}
      <span className={`status-pill status-pill-${item.status}`}>{STATUS_LABEL[item.status]}</span>
      <span className="bl-est">{item.estimateHours ? fmtHours(item.estimateHours) : ''}</span>
      <span className="bl-due">{fmtDate(item.dueDate)}</span>
      {item.type === 'task'
        ? member ? <span className="avatar avatar-active" title={member.name}>{initials(member.name)}</span> : <span className="avatar avatar-vacant" title="Unassigned">?</span>
        : <span className="avatar-spacer" />}
    </div>
  )
}

function EpicTree({ view, onOpen }) {
  const [open, setOpen] = useState(() => new Set(view.epics.slice(0, 1).map((e) => e._id)))
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const render = (item, depth) => {
    const kids = view.children.get(item._id) ?? []
    const expanded = open.has(item._id)
    return (
      <div key={item._id}>
        <Row item={item} depth={depth} member={view.members.get(item.assignee)} onOpen={onOpen}
          toggle={kids.length ? () => toggle(item._id) : null} expanded={expanded} />
        {expanded && kids.map((k) => render(k, depth + 1))}
      </div>
    )
  }
  return (
    <div className="bl-list">
      {view.epics.map((e) => {
        const tasks = view.tasks.filter((t) => t.epic === e._id)
        const done = tasks.filter((t) => t.status === 'done').length
        return (
          <section key={e._id} className="bl-epic">
            {render(e, 0)}
            <div className="bl-epic-meta">
              <span className="progress"><span style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></span>
              <small>{done}/{tasks.length} tasks · {fmtDate(e.plannedStart)} – {fmtDate(e.plannedEnd)} · {e.priority} · BRD {e.brdRefs.join(', ') || '—'}</small>
            </div>
          </section>
        )
      })}
    </div>
  )
}

function SprintView({ data, view, onOpen }) {
  const [collapsed, setCollapsed] = useState(() => new Set(data.sprints.filter((s) => s.status === 'completed').map((s) => s._id)))
  const toggle = (id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const unscheduled = view.tasks.filter((t) => !t.sprint)
  return (
    <div className="backlog">
      {data.sprints.map((s) => {
        const tasks = view.tasks.filter((t) => t.sprint === s._id).sort((a, b) => new Date(a.plannedStart) - new Date(b.plannedStart))
        const pct = s.capacityHours ? Math.min(100, (s.plannedHours / s.capacityHours) * 100) : 0
        const isOpen = !collapsed.has(s._id)
        return (
          <section key={s._id} className="backlog-section">
            <header>
              <button type="button" className="bl-toggle" onClick={() => toggle(s._id)} aria-label={isOpen ? 'Collapse sprint' : 'Expand sprint'}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              <h3>{s.name}</h3>
              <span className={`sprint-status sprint-${s.status}`}>{s.status}</span>
              <span className="muted">{fmtDate(s.startDate)} – {fmtDate(s.endDate)}</span>
              <span className="count">{tasks.length} work items</span>
            </header>
            <p className="sprint-goal"><strong>Goal:</strong> {s.goal}</p>
            <div className="capacity" title={`${s.plannedHours} h planned of ${s.capacityHours} h team capacity`}>
              <span className="progress"><span style={{ width: `${pct}%` }} /></span>
              <small>{s.plannedHours} h planned / {s.capacityHours} h capacity</small>
            </div>
            {isOpen && (
              <div className="bl-list">
                {tasks.map((t) => <Row key={t._id} item={t} epic={view.byId.get(t.epic)} member={view.members.get(t.assignee)} onOpen={onOpen} />)}
              </div>
            )}
          </section>
        )
      })}
      {unscheduled.length > 0 && (
        <section className="backlog-section">
          <header><h3>Backlog</h3><span className="count">{unscheduled.length} work items</span></header>
          <div className="bl-list">
            {unscheduled.map((t) => <Row key={t._id} item={t} epic={view.byId.get(t.epic)} member={view.members.get(t.assignee)} onOpen={onOpen} />)}
          </div>
        </section>
      )}
    </div>
  )
}

export default function ProjectBacklog({ project }) {
  const { data, error, loading, reload } = useWorkItems(project.id)
  const [params, setParams] = useSearchParams()
  const mode = params.get('view') === 'epics' ? 'epics' : 'sprints'
  const openKey = params.get('task')

  const view = useMemo(() => data && { ...indexWorkItems(data.items), members: new Map(data.members.map((m) => [m.id, m])) }, [data])
  const setParam = (k, v) => setParams((p) => { if (v) p.set(k, v); else p.delete(k); return p })

  if (loading) return <div className="panel-state"><span className="spinner" /> Loading backlog…</div>
  if (error) return <div className="form-alert">{error}</div>
  if (view.tasks.length === 0) {
    return (
      <div className="board-empty-state">
        <h2>Your backlog is empty</h2>
        <p>Let the Planning Agent read the BRD and build epics, stories, tasks and sprints.</p>
        <Link className="btn-primary link-btn" to={`/projects/${project.id}/ai`}>Open the AI Orchestrator</Link>
      </div>
    )
  }

  const vacant = view.tasks.filter(isVacant)
  const byRole = vacant.reduce((acc, t) => ({ ...acc, [t.requiredRole]: (acc[t.requiredRole] ?? 0) + 1 }), {})

  return (
    <>
      <div className="backlog-toolbar">
        <div className="segmented" role="tablist">
          <button type="button" role="tab" aria-selected={mode === 'sprints'} className={mode === 'sprints' ? 'active' : ''} onClick={() => setParam('view', null)}>Sprints</button>
          <button type="button" role="tab" aria-selected={mode === 'epics'} className={mode === 'epics' ? 'active' : ''} onClick={() => setParam('view', 'epics')}>Epics</button>
        </div>
        <span className="muted">{view.epics.length} epics · {view.tasks.length} tasks · {view.tasks.filter((t) => t.status === 'done').length} done</span>
      </div>
      {vacant.length > 0 && (
        <div className="banner banner-vacant">
          <AlertTriangle size={16} />
          <div>
            <strong>⚠️ {vacant.length} task{vacant.length === 1 ? '' : 's'} pending assignment</strong>
            <span>Required: {Object.entries(byRole).map(([r, n]) => `${r} (${n})`).join(', ')}. Invite someone with that role from the <Link to="/team">Team</Link> tab and the Orchestrator will assign them.</span>
          </div>
        </div>
      )}

      {mode === 'epics' ? <EpicTree view={view} onOpen={(k) => setParam('task', k)} /> : <SprintView data={data} view={view} onOpen={(k) => setParam('task', k)} />}

      {openKey && <TaskDrawer projectId={project.id} itemKey={openKey} onClose={() => setParam('task', null)} onOpen={(k) => setParam('task', k)} onChanged={reload} />}
    </>
  )
}

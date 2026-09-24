import { AlertTriangle, CheckCircle2, Circle, Link2, Lock, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { initials } from '../lib/format'
import { STATUSES, STATUS_LABEL, fmtDate, fmtHours } from '../lib/workItems'

function KeyLink({ item, onOpen }) {
  return (
    <button type="button" className="key-link" onClick={() => onOpen(item.key)} title={item.title}>
      <span className="key-badge">{item.key}</span> {item.title}
      <span className={`status-dot status-dot-${item.status}`} title={STATUS_LABEL[item.status] ?? item.status} />
    </button>
  )
}

/** Side panel with everything about one work item, opened from the board, backlog or an email link. */
export function TaskDrawer({ projectId, itemKey, onClose, onOpen, onChanged, startVerify = false }) {
  const ref = useRef(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [checked, setChecked] = useState([])
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    return () => dialog.close()
  }, [])

  useEffect(() => {
    let cancelled = false
    api(`/projects/${projectId}/work-items/${encodeURIComponent(itemKey)}`)
      .then((res) => {
        if (cancelled) return
        setData(res)
        setError('')
        setNotice('')
        // Opened by dropping a card on Done: go straight to the acceptance check.
        const wantsVerify = startVerify && res.item.status !== 'done' && res.item.acceptanceCriteria.length > 0
        setChecked(res.item.acceptanceCriteria.map(() => false))
        setVerifying(wantsVerify)
      })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [projectId, itemKey, startVerify])

  async function move(status, key = itemKey, acceptanceVerified = false) {
    setBusy(true)
    setError('')
    try {
      const res = await api(`/projects/${projectId}/work-items/${encodeURIComponent(key)}/status`, {
        method: 'PATCH', body: { status, acceptanceVerified },
      })
      const fresh = await api(`/projects/${projectId}/work-items/${encodeURIComponent(itemKey)}`)
      setData(fresh)
      setVerifying(false)
      if (res.unblocked?.length) setNotice(`Now actionable: ${res.unblocked.join(', ')}`)
      onChanged?.()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  function requestStatus(status) {
    const item = data.item
    if (status === 'done' && item.type === 'task' && item.acceptanceCriteria.length) {
      setChecked(item.acceptanceCriteria.map(() => false))
      setVerifying(true)
      return
    }
    move(status)
  }

  const item = data?.item
  const blocked = item && item.blockedBy?.length > 0 && item.status !== 'done'
  const vacant = item?.type === 'task' && item.assignment?.state === 'pending' && item.status !== 'done'
  const actionable = item && (item.type === 'task' || item.type === 'subtask')

  return (
    <dialog ref={ref} className="drawer" onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === ref.current) onClose() }} aria-label={item ? `${item.key} ${item.title}` : 'Work item'}>
      <div className="drawer-head">
        <span className="drawer-crumbs">
          {data?.epic && <><span className="key-badge">{data.epic.key}</span><span className="muted">/</span></>}
          {data?.parent && data.parent.key !== data?.epic?.key && <><span className="key-badge">{data.parent.key}</span><span className="muted">/</span></>}
          {item && <span className="key-badge key-badge-strong">{item.key}</span>}
          {item && <span className="type-pill">{item.type}</span>}
        </span>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      {!data && !error && <div className="panel-state"><span className="spinner" /> Loading…</div>}
      {error && <div className="form-alert" role="alert">{error}</div>}

      {item && (
        <div className="drawer-body">
          <h2>{item.title}</h2>
          {notice && <div className="notice notice-ok"><div><strong>{notice}</strong></div></div>}
          {blocked && (
            <div className="banner banner-blocked"><Lock size={16} />
              <div><strong>Blocked</strong><span>{item.blockedReason}</span></div>
            </div>
          )}
          {vacant && (
            <div className="banner banner-vacant"><AlertTriangle size={16} />
              <div><strong>Pending Assignment — {item.requiredRole} required</strong><span>{item.assignment.reason}</span></div>
            </div>
          )}

          {actionable && (
            <div className="status-switch" role="group" aria-label="Status">
              {STATUSES.map((s) => (
                <button key={s.id} type="button" className={item.status === s.id ? 'active' : ''} disabled={busy || item.status === s.id}
                  onClick={() => requestStatus(s.id)}>{s.label}</button>
              ))}
            </div>
          )}

          {verifying && (
            <div className="verify-box">
              <strong>Verify the acceptance criteria before marking done</strong>
              {item.acceptanceCriteria.map((c, i) => (
                <label key={i} className="check-line">
                  <input type="checkbox" checked={checked[i]} onChange={() => setChecked(checked.map((v, j) => (j === i ? !v : v)))} />
                  {c.text}
                </label>
              ))}
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setVerifying(false)}>Cancel</button>
                <button type="button" className="btn-primary" disabled={busy || !checked.every(Boolean)} onClick={() => move('done', itemKey, true)}>
                  All met, mark done
                </button>
              </div>
            </div>
          )}

          <dl className="facts drawer-facts">
            <div><dt>Assignee</dt><dd>{data.assignee
              ? <span className="person"><span className="avatar avatar-active">{initials(data.assignee.name)}</span>{data.assignee.name}<small>{data.assignee.role}</small></span>
              : item.type === 'task' || item.type === 'subtask' ? <span className="vacant-chip">Vacant</span> : <span className="muted">—</span>}
              {item.assignment?.notification && (
                <small>{{ sent: 'Assignment email sent', failed: 'Assignment email could not be delivered', not_configured: 'Email not configured: notification logged on the server' }[item.assignment.notification]}{item.assignment.notifiedAt ? ` · ${new Date(item.assignment.notifiedAt).toLocaleString()}` : ''}</small>
              )}</dd></div>
            {item.requiredRole && <div><dt>Required role</dt><dd>{item.requiredRole}{item.skills?.length > 0 && <small>Skills: {item.skills.join(', ')}</small>}</dd></div>}
            <div><dt>Priority</dt><dd><span className={`priority priority-${item.priority}`}>{item.priority}</span></dd></div>
            <div><dt>Estimate</dt><dd>{fmtHours(item.estimateHours)} <small>{item.estimateHours} hours</small></dd></div>
            <div><dt>Planned</dt><dd>{fmtDate(item.plannedStart)} → {fmtDate(item.plannedEnd)}<small>Due {fmtDate(item.dueDate, { dateStyle: 'long' })}{data.sprint ? ` · ${data.sprint.name}` : ''}</small></dd></div>
          </dl>

          {item.description && <section className="drawer-section"><h3>Description</h3><p>{item.description}</p></section>}
          {item.objective && <section className="drawer-section"><h3>Business objective</h3><p>{item.objective}</p></section>}

          {item.acceptanceCriteria.length > 0 && (
            <section className="drawer-section">
              <h3>Acceptance criteria</h3>
              <ul className="criteria">
                {item.acceptanceCriteria.map((c, i) => (
                  <li key={i}>{c.met ? <CheckCircle2 size={15} className="ok" /> : <Circle size={15} />}{c.text}</li>
                ))}
              </ul>
            </section>
          )}

          {data.children.length > 0 && (
            <section className="drawer-section">
              <h3>{item.type === 'task' ? 'Subtasks' : item.type === 'story' ? 'Tasks' : 'Stories'} <span className="count">{data.children.length}</span></h3>
              <ul className="child-list">
                {data.children.map((c) => (
                  <li key={c.key}>
                    {c.type === 'subtask' ? (
                      <label className="check-line">
                        <input type="checkbox" checked={c.status === 'done'} disabled={busy || blocked}
                          onChange={() => move(c.status === 'done' ? 'todo' : 'done', c.key)} />
                        <span className={c.status === 'done' ? 'done-text' : ''}>{c.title}</span>
                      </label>
                    ) : <KeyLink item={c} onOpen={onOpen} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(data.dependencies.length > 0 || data.dependents.length > 0) && (
            <section className="drawer-section">
              <h3><Link2 size={14} /> Dependencies</h3>
              {data.dependencies.length > 0 && <p className="dep-label">Depends on</p>}
              {data.dependencies.map((d) => <KeyLink key={d.key} item={d} onOpen={onOpen} />)}
              {data.dependents.length > 0 && <p className="dep-label">Blocks</p>}
              {data.dependents.map((d) => <KeyLink key={d.key} item={d} onOpen={onOpen} />)}
            </section>
          )}

          {data.requirements.length > 0 && (
            <section className="drawer-section">
              <h3>BRD requirements</h3>
              {data.requirements.map((r) => (
                <p key={r.id} className="req-line"><span className="req-id">{r.id}</span>{r.text}</p>
              ))}
            </section>
          )}

          {data.history.length > 0 && (
            <section className="drawer-section">
              <h3>AI decisions and history</h3>
              <ol className="history">
                {data.history.map((h) => (
                  <li key={h._id}>
                    <span className="history-meta">{new Date(h.at).toLocaleString()} · {h.agent}</span>
                    <strong>{h.decision}</strong>
                    {h.reason && <span>{h.reason}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
    </dialog>
  )
}

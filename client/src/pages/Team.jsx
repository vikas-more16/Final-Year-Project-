import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmModal, Modal } from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { initials, relativeDays } from '../lib/format'
import '../styles/team.css'

const STATUS_LABEL = { active: 'Active', pending: 'Pending', expired: 'Expired', declined: 'Declined' }
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending invitations' },
]

function ProjectPicker({ projects, selected, onChange }) {
  if (!projects.length) {
    return <p className="picker-empty">No projects yet. <Link to="/projects">Create a project</Link> to assign members to it.</p>
  }
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  return (
    <div className="project-picker" role="group" aria-label="Projects">
      {projects.map((p) => (
        <label key={p.id} className={`picker-item${selected.includes(p.id) ? ' checked' : ''}`}>
          <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
          <span className="key-badge">{p.key}</span>
          <span>{p.name}</span>
        </label>
      ))}
    </div>
  )
}

function MemberForm({ member, roles, projects, onSaved, onClose }) {
  const editing = Boolean(member)
  const [form, setForm] = useState({
    name: member?.name ?? '',
    email: member?.email ?? '',
    role: member?.role ?? '',
    projectIds: member?.projects.map((p) => p.id) ?? [],
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (field, value) => {
    setForm({ ...form, [field]: value })
    if (errors[field]) setErrors({ ...errors, [field]: undefined })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const found = {}
    if (form.name.trim().length < 2) found.name = 'Enter the member’s full name'
    if (!editing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) found.email = 'Enter a valid email address'
    if (!form.role) found.role = 'Choose a role'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    setError('')
    try {
      const result = editing
        ? await api(`/team/${member.id}`, { method: 'PATCH', body: { name: form.name, role: form.role, projectIds: form.projectIds } })
        : await api('/team', { method: 'POST', body: form })
      onSaved(result)
    } catch (err) {
      setErrors(err.fields)
      if (!Object.keys(err.fields).length) setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={editing ? `Manage ${member.name}` : 'Invite a team member'} onClose={onClose}>
      {!editing && <p className="modal-text">They’ll get an email invitation. Until they accept, they appear as <b>Pending</b>.</p>}
      {error && <div className="form-alert" role="alert">{error}</div>}
      <form onSubmit={handleSubmit} noValidate className="stack-form">
        <div className="form-grid">
          <div className="field">
            <label htmlFor="m-name">Full name</label>
            <input id="m-name" className={`text-input${errors.name ? ' has-error' : ''}`} value={form.name}
              onChange={(e) => set('name', e.target.value)} placeholder="Yash Mali" />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>
          <div className="field">
            <label htmlFor="m-email">Email</label>
            <input id="m-email" type="email" className={`text-input${errors.email ? ' has-error' : ''}`} value={form.email}
              onChange={(e) => set('email', e.target.value)} placeholder="yash@company.com" disabled={editing} />
            {errors.email && <p className="field-error">{errors.email}</p>}
          </div>
        </div>
        <div className="field">
          <label htmlFor="m-role">Role</label>
          <select id="m-role" className={`text-input${errors.role ? ' has-error' : ''}`} value={form.role}
            onChange={(e) => set('role', e.target.value)}>
            <option value="" disabled>Select a role</option>
            {roles.map((r) => <option key={r}>{r}</option>)}
          </select>
          {errors.role && <p className="field-error">{errors.role}</p>}
        </div>
        <div className="field">
          <label>Projects</label>
          <ProjectPicker projects={projects} selected={form.projectIds} onChange={(ids) => set('projectIds', ids)} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Send invitation'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function StatusBadge({ member }) {
  const hint = member.status === 'pending' ? `Expires ${relativeDays(member.inviteExpiresAt)}`
    : member.status === 'active' && member.respondedAt ? `Joined ${new Date(member.respondedAt).toLocaleDateString()}`
      : member.status === 'expired' ? 'Resend to invite again'
        : member.status === 'declined' ? 'Invitation declined' : ''
  return (
    <div className="status-cell">
      <span className={`status status-${member.status}`}>{STATUS_LABEL[member.status]}</span>
      {hint && <small>{hint}</small>}
    </div>
  )
}

function InviteNotice({ notice, onClose }) {
  const [copied, setCopied] = useState(false)
  if (!notice) return null
  const copy = async () => {
    await navigator.clipboard.writeText(notice.inviteUrl)
    setCopied(true)
  }
  return (
    <div className={`notice ${notice.inviteUrl ? 'notice-warn' : 'notice-ok'}`} role="status">
      <div>
        <strong>{notice.title}</strong>
        {notice.inviteUrl
          ? <p>The email could not be delivered, so share this link with them directly:<code>{notice.inviteUrl}</code></p>
          : <p>{notice.text}</p>}
      </div>
      {notice.inviteUrl && <button type="button" className="btn-secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>}
      <button type="button" className="icon-button" onClick={onClose} aria-label="Dismiss">×</button>
    </div>
  )
}

export default function Team() {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | member
  const [removing, setRemoving] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    Promise.all([api('/team'), api('/projects')])
      .then(([team, proj]) => {
        setMembers(team.members)
        setRoles(team.roles)
        setProjects(proj.projects)
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const counts = useMemo(() => ({
    all: members.length,
    active: members.filter((m) => m.status === 'active').length,
    pending: members.filter((m) => m.status !== 'active').length,
  }), [members])

  const visible = members.filter((m) => {
    if (filter === 'active' && m.status !== 'active') return false
    if (filter === 'pending' && m.status === 'active') return false
    const q = query.trim().toLowerCase()
    return !q || m.name.toLowerCase().includes(q) || m.email.includes(q) || m.role.toLowerCase().includes(q)
  })

  const upsert = (member) => setMembers((list) => {
    const exists = list.some((m) => m.id === member.id)
    return exists ? list.map((m) => (m.id === member.id ? member : m)) : [member, ...list]
  })

  function inviteNotice({ member, emailed, inviteUrl }, verb) {
    setNotice({
      title: `Invitation ${verb} to ${member.name}`,
      text: emailed ? `An email is on its way to ${member.email}.` : '',
      inviteUrl: emailed ? undefined : inviteUrl,
    })
  }

  function handleSaved(result) {
    upsert(result.member)
    if (editing === 'new') inviteNotice(result, 'sent')
    else setNotice({ title: `${result.member.name} updated`, text: 'Role and project assignments were saved.' })
    setEditing(null)
  }

  async function handleResend(member) {
    setBusyId(member.id)
    try {
      const result = await api(`/team/${member.id}/resend`, { method: 'POST' })
      upsert(result.member)
      inviteNotice(result, 'resent')
    } catch (err) {
      setNotice({ title: 'Could not resend the invitation', text: err.message })
    }
    setBusyId(null)
  }

  async function handleRemove() {
    setBusyId(removing.id)
    try {
      await api(`/team/${removing.id}`, { method: 'DELETE' })
      setMembers((list) => list.filter((m) => m.id !== removing.id))
      setNotice({ title: removing.status === 'active' ? `${removing.name} removed` : 'Invitation cancelled', text: '' })
      setRemoving(null)
    } catch (err) {
      setNotice({ title: 'Could not remove member', text: err.message })
    }
    setBusyId(null)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow eyebrow-dark">TEAM</p>
          <h1 className="page-title">People in {user.organization || 'your workspace'}</h1>
          <p className="app-lead">Invite collaborators, choose their role, and decide which projects they work on.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setEditing('new')} disabled={loading || !!loadError}>
          + Invite member
        </button>
      </div>

      <InviteNotice key={notice?.inviteUrl ?? notice?.title} notice={notice} onClose={() => setNotice(null)} />

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id}
              className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
              {f.label} <span>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <input className="text-input search" type="search" placeholder="Search name, email or role"
          value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search team" />
      </div>

      {loading ? (
        <div className="panel-state"><span className="spinner" /> Loading team…</div>
      ) : loadError ? (
        <div className="panel-state error">{loadError}</div>
      ) : members.length === 0 ? (
        <div className="app-empty">
          <h2>No team members yet</h2>
          <p>Invite the people you work with. They become <b>active</b> once they accept the email invitation.</p>
          <button type="button" className="btn-primary" onClick={() => setEditing('new')}>+ Invite your first member</button>
        </div>
      ) : visible.length === 0 ? (
        <div className="panel-state">No members match this view.</div>
      ) : (
        <div className="member-table" role="table" aria-label="Team members">
          <div className="member-row member-head" role="row">
            <span role="columnheader">Member</span>
            <span role="columnheader">Role</span>
            <span role="columnheader">Projects</span>
            <span role="columnheader">Status</span>
            <span role="columnheader"><span className="sr-only">Actions</span></span>
          </div>
          {visible.map((m) => (
            <div className={`member-row${m.status !== 'active' ? ' is-inactive' : ''}`} role="row" key={m.id}>
              <span role="cell" className="member-cell">
                <span className={`avatar avatar-${m.status}`}>{initials(m.name)}</span>
                <span className="member-id"><strong>{m.name}</strong><small>{m.email}</small></span>
              </span>
              <span role="cell" className="role-cell">{m.role}</span>
              <span role="cell" className="projects-cell">
                {m.projects.length
                  ? m.projects.map((p) => <span className="key-badge" key={p.id} title={p.name}>{p.key}</span>)
                  : <small className="muted">No projects</small>}
              </span>
              <span role="cell"><StatusBadge member={m} /></span>
              <span role="cell" className="actions-cell">
                <button type="button" className="link-button" onClick={() => setEditing(m)}>Manage</button>
                {m.status !== 'active' && (
                  <button type="button" className="link-button" onClick={() => handleResend(m)} disabled={busyId === m.id}>
                    {busyId === m.id ? 'Sending…' : 'Resend'}
                  </button>
                )}
                <button type="button" className="link-button danger" onClick={() => setRemoving(m)}>
                  {m.status === 'active' ? 'Remove' : 'Cancel'}
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <MemberForm
          member={editing === 'new' ? null : editing}
          roles={roles}
          projects={projects}
          onSaved={handleSaved}
          onClose={() => setEditing(null)}
        />
      )}
      {removing && (
        <ConfirmModal
          title={removing.status === 'active' ? `Remove ${removing.name}?` : 'Cancel invitation?'}
          message={removing.status === 'active'
            ? `${removing.name} will lose access to all projects in this workspace. You can invite them again later.`
            : `The invitation link sent to ${removing.email} will stop working.`}
          confirmLabel={removing.status === 'active' ? 'Remove member' : 'Cancel invitation'}
          danger
          busy={busyId === removing.id}
          onConfirm={handleRemove}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  )
}

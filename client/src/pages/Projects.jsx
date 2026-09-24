import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmModal, Modal } from '../components/Modal'
import { api } from '../lib/api'
import '../styles/team.css'

function suggestKey(name) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  const key = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 4)
  return key.replace(/^[0-9]+/, '').slice(0, 10)
}

function ProjectForm({ onSaved, onClose }) {
  const [form, setForm] = useState({ name: '', key: '', description: '' })
  const [keyTouched, setKeyTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const setName = (name) => {
    setForm({ ...form, name, key: keyTouched ? form.key : suggestKey(name) })
    setErrors({ ...errors, name: undefined, key: keyTouched ? errors.key : undefined })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const { project } = await api('/projects', { method: 'POST', body: form })
      onSaved(project)
    } catch (err) {
      setErrors(Object.keys(err.fields).length ? err.fields : { name: err.message })
      setBusy(false)
    }
  }

  return (
    <Modal title="Create a project" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="stack-form">
        <div className="form-grid form-grid-key">
          <div className="field">
            <label htmlFor="p-name">Project name</label>
            <input id="p-name" className={`text-input${errors.name ? ' has-error' : ''}`} value={form.name}
              onChange={(e) => setName(e.target.value)} placeholder="Mobile Banking App" maxLength={80} />
            {errors.name && <p className="field-error">{errors.name}</p>}
          </div>
          <div className="field">
            <label htmlFor="p-key">Key</label>
            <input id="p-key" className={`text-input mono${errors.key ? ' has-error' : ''}`} value={form.key} maxLength={10}
              onChange={(e) => { setKeyTouched(true); setForm({ ...form, key: e.target.value.toUpperCase() }); setErrors({ ...errors, key: undefined }) }}
              placeholder="MBA" />
            {errors.key && <p className="field-error">{errors.key}</p>}
          </div>
        </div>
        <p className="hint">The key prefixes every task in this project, e.g. <b>{form.key || 'MBA'}-12</b>.</p>
        <div className="field">
          <label htmlFor="p-desc">Description <small className="muted">(optional)</small></label>
          <textarea id="p-desc" className="text-input" rows={3} maxLength={500} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What is this project about?" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Projects() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api('/projects')
      .then((data) => setProjects(data.projects))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete() {
    setBusy(true)
    try {
      await api(`/projects/${deleting.id}`, { method: 'DELETE' })
      setProjects((list) => list.filter((p) => p.id !== deleting.id))
      setDeleting(null)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow eyebrow-dark">PROJECTS</p>
          <h1 className="page-title">Your projects</h1>
          <p className="app-lead">Create projects, then assign people to them from the <Link to="/team">Team</Link> tab.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCreating(true)} disabled={loading}>+ New project</button>
      </div>

      {error && <div className="form-alert" role="alert">{error}</div>}

      {loading ? (
        <div className="panel-state"><span className="spinner" /> Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="app-empty">
          <h2>No projects yet</h2>
          <p>Create your first project. Soon the planning agents will turn its brief into a backlog and sprints.</p>
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>+ Create a project</button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <article className="project-card" key={p.id}>
              <div className="project-card-head">
                <span className="key-badge key-badge-lg">{p.key}</span>
                <button type="button" className="link-button danger" onClick={() => setDeleting(p)}>Delete</button>
              </div>
              <h2>{p.name}</h2>
              <p>{p.description || <span className="muted">No description</span>}</p>
              <small>{p.memberCount} member{p.memberCount === 1 ? '' : 's'} · created {new Date(p.createdAt).toLocaleDateString()}</small>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <ProjectForm
          onSaved={(project) => { setProjects((list) => [project, ...list]); setCreating(false) }}
          onClose={() => setCreating(false)}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.name}?`}
          message="The project will be removed and unassigned from every team member. This cannot be undone."
          confirmLabel="Delete project"
          danger
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}

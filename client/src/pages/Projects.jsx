import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BrdRow } from '../components/BrdRow'
import { FileDrop } from '../components/FileDrop'
import { ConfirmModal, Modal } from '../components/Modal'
import { api } from '../lib/api'
import { useProjects } from '../context/ProjectsContext'
import { brdProblem } from '../lib/files'
import '../styles/team.css'

function suggestKey(name) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  const key = words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 4)
  return key.replace(/^[0-9]+/, '').slice(0, 10)
}

function ProjectForm({ models, onSaved, onClose }) {
  const [form, setForm] = useState({ name: '', key: '', model: '', description: '' })
  const [brd, setBrd] = useState(null)
  const [keyTouched, setKeyTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (field, value) => {
    setForm({ ...form, [field]: value })
    if (errors[field]) setErrors({ ...errors, [field]: undefined })
  }
  const setName = (name) => {
    setForm({ ...form, name, key: keyTouched ? form.key : suggestKey(name) })
    setErrors({ ...errors, name: undefined, key: keyTouched ? errors.key : undefined })
  }
  const chooseBrd = (file) => {
    setBrd(file)
    setErrors({ ...errors, brd: file ? brdProblem(file) ?? undefined : undefined })
  }
  const selectedModel = models.find((m) => m.id === form.model)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const found = {}
    if (form.name.trim().length < 2) found.name = 'Project name must be 2–80 characters'
    if (!/^[A-Z][A-Z0-9]{1,9}$/.test(form.key)) found.key = 'Key must be 2–10 letters or digits, starting with a letter'
    if (!form.model) found.model = 'Choose a development model'
    const brdError = brdProblem(brd)
    if (brdError) found.brd = brdError
    setErrors(found)
    if (Object.keys(found).length) return

    const body = new FormData()
    Object.entries(form).forEach(([k, v]) => body.append(k, v))
    body.append('brd', brd)

    setBusy(true)
    try {
      const { project } = await api('/projects', { method: 'POST', body })
      onSaved(project)
    } catch (err) {
      setErrors(err.fields)
      if (!Object.keys(err.fields).length) setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title="Create a project" onClose={onClose} width={560}>
      {error && <div className="form-alert" role="alert">{error}</div>}
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
              onChange={(e) => { setKeyTouched(true); set('key', e.target.value.toUpperCase()) }}
              placeholder="MBA" />
            {errors.key && <p className="field-error">{errors.key}</p>}
          </div>
        </div>
        <p className="hint">The key prefixes every task in this project, e.g. <b>{form.key || 'MBA'}-12</b>.</p>

        <div className="field">
          <label htmlFor="p-model">Model</label>
          <select id="p-model" className={`text-input${errors.model ? ' has-error' : ''}`} value={form.model}
            onChange={(e) => set('model', e.target.value)}>
            <option value="" disabled>Select a development model</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
          </select>
          {errors.model
            ? <p className="field-error">{errors.model}</p>
            : selectedModel && <p className="field-note">{selectedModel.description}</p>}
        </div>

        <div className="field">
          <label htmlFor="p-brd">BRD document</label>
          <FileDrop id="p-brd" file={brd} onChange={chooseBrd} error={errors.brd} />
          {errors.brd
            ? <p className="field-error">{errors.brd}</p>
            : <p className="field-note">The Business Requirements Document your agents will plan the project from.</p>}
        </div>

        <div className="field">
          <label htmlFor="p-desc">Description <small className="muted">(optional)</small></label>
          <textarea id="p-desc" className="text-input" rows={2} maxLength={500} value={form.description}
            onChange={(e) => set('description', e.target.value)} placeholder="What is this project about?" />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Uploading…' : 'Create project'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Projects() {
  const { projects, models, loading, error: loadError, addProject, updateProject, removeProject } = useProjects()
  const [searchParams, setSearchParams] = useSearchParams()
  const [actionError, setError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const error = actionError || loadError

  // The create dialog is driven by ?new=1 so the sidebar's "+" can open it from anywhere.
  const creating = searchParams.get('new') === '1' && !loading
  const openCreate = () => setSearchParams({ new: '1' })
  const closeCreate = () => setSearchParams({}, { replace: true })

  async function handleDelete() {
    setBusy(true)
    try {
      await api(`/projects/${deleting.id}`, { method: 'DELETE' })
      removeProject(deleting.id)
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
        <button type="button" className="btn-primary" onClick={openCreate} disabled={loading}>+ New project</button>
      </div>

      {error && <div className="form-alert" role="alert">{error}</div>}

      {loading ? (
        <div className="panel-state"><span className="spinner" /> Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="app-empty">
          <h2>No projects yet</h2>
          <p>Create your first project with its development model and BRD. Soon the planning agents will turn the BRD into a backlog and sprints.</p>
          <button type="button" className="btn-primary" onClick={openCreate}>+ Create a project</button>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <article className="project-card" key={p.id}>
              <div className="project-card-head">
                <span className="key-badge key-badge-lg">{p.key}</span>
                {p.model && <span className="model-badge">{p.model}</span>}
                <button type="button" className="link-button danger" onClick={() => setDeleting(p)}>Delete</button>
              </div>
              <h2><Link to={`/projects/${p.id}`} className="project-card-link">{p.name}</Link></h2>
              <p>{p.description || <span className="muted">No description</span>}</p>
              <BrdRow project={p} onReplaced={updateProject} onError={setError} />
              <small>{p.memberCount} member{p.memberCount === 1 ? '' : 's'} · created {new Date(p.createdAt).toLocaleDateString()}</small>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <ProjectForm
          models={models}
          onSaved={(project) => { addProject(project); closeCreate() }}
          onClose={closeCreate}
        />
      )}
      {deleting && (
        <ConfirmModal
          title={`Delete ${deleting.name}?`}
          message="The project and its BRD will be removed and unassigned from every team member. This cannot be undone."
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

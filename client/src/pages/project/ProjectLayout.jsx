import { ArrowLeft, ArrowRight, Ellipsis, EyeOff, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ProjectAvatar } from '../../components/AppLayout'
import { Menu } from '../../components/Menu'
import { useProjects } from '../../context/ProjectsContext'
import { api } from '../../lib/api'
import { PROJECT_TABS, TAB_BY_ID } from '../../lib/projectTabs'
import '../../styles/team.css'
import '../../styles/project.css'
import '../../styles/ai.css'

function TabMenu({ index, count, onMove, onRemove }) {
  return (
    <Menu
      className="ptab-menu"
      align="left"
      trigger={(props) => (
        <button type="button" className="ptab-more" aria-label="Tab options" {...props}><Ellipsis size={15} /></button>
      )}
    >
      {(close) => (
        <>
          <button type="button" role="menuitem" disabled={index === 0} onClick={() => { onMove(-1); close() }}>
            <ArrowLeft size={15} /> Move left
          </button>
          <button type="button" role="menuitem" disabled={index === count - 1} onClick={() => { onMove(1); close() }}>
            <ArrowRight size={15} /> Move right
          </button>
          <button type="button" role="menuitem" className="danger" disabled={count === 1} onClick={() => { onRemove(); close() }}
            title={count === 1 ? 'A project needs at least one tab' : undefined}>
            <EyeOff size={15} /> Remove from project
          </button>
        </>
      )}
    </Menu>
  )
}

function AddTabMenu({ hidden, onAdd }) {
  return (
    <Menu
      className="ptab-add"
      align="right"
      trigger={(props) => (
        <button type="button" className="ptab-add-button" aria-label="Add a tab" title="Add a tab" {...props}><Plus size={17} /></button>
      )}
    >
      {(close) => (
        <div className="add-tab-panel">
          <p className="menu-title">Add to project</p>
          {hidden.length === 0 && <p className="menu-empty">All views are already on this project.</p>}
          {hidden.map(({ id, label, Icon, description }) => (
            <button type="button" role="menuitem" key={id} className="add-tab-item" onClick={() => { onAdd(id); close() }}>
              <span className="add-tab-icon"><Icon size={17} /></span>
              <span><strong>{label}</strong><small>{description}</small></span>
            </button>
          ))}
        </div>
      )}
    </Menu>
  )
}

export default function ProjectLayout() {
  const { projectId } = useParams()
  const { updateProject } = useProjects()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api(`/projects/${projectId}`)
      .then((res) => { if (!cancelled) setData(res) })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [projectId])

  const setProject = (updated) => {
    setData((d) => ({ ...d, project: { ...d.project, ...updated } }))
    updateProject(updated)
  }

  if (error) {
    return (
      <div className="app-empty">
        <h2>Project not available</h2>
        <p>{error}</p>
        <Link to="/projects">← Back to projects</Link>
      </div>
    )
  }
  // Previous project's data must not flash while the next one loads.
  if (!data || data.project.id !== projectId) {
    return <div className="panel-state"><span className="spinner" /> Loading project…</div>
  }
  // Rendered as a separate component so everything below can rely on a loaded project.
  return <ProjectView data={data} setProject={setProject} />
}

function ProjectView({ data, setProject }) {
  const { project, members, models } = data
  const navigate = useNavigate()
  const location = useLocation()
  const [tabError, setTabError] = useState('')
  const currentTab = location.pathname.split('/')[3]

  async function saveTabs(tabs, goTo) {
    const previous = project.tabs
    setTabError('')
    setProject({ id: project.id, tabs })
    if (goTo) navigate(`/projects/${project.id}/${goTo}`)
    try {
      await api(`/projects/${project.id}/tabs`, { method: 'PUT', body: { tabs } })
    } catch (err) {
      setProject({ id: project.id, tabs: previous })
      setTabError(`Could not save the tab layout: ${err.message}`)
    }
  }

  const moveTab = (index, delta) => {
    const tabs = [...project.tabs]
    ;[tabs[index], tabs[index + delta]] = [tabs[index + delta], tabs[index]]
    saveTabs(tabs)
  }
  const removeTab = (id) => {
    const tabs = project.tabs.filter((t) => t !== id)
    saveTabs(tabs, currentTab === id ? tabs[0] : undefined)
  }
  const addTab = (id) => saveTabs([...project.tabs, id], id)

  const hidden = PROJECT_TABS.filter((t) => !project.tabs.includes(t.id))

  return (
    <div className="project-page">
      <p className="crumbs"><Link to="/projects">Projects</Link></p>
      <div className="project-title-row">
        <ProjectAvatar project={project} size={30} />
        <h1>{project.name}</h1>
        {project.model && <span className="model-badge">{project.model}</span>}
      </div>

      <div className="ptabs" role="tablist" aria-label="Project views">
        {project.tabs.map((id, index) => {
          const tab = TAB_BY_ID[id]
          return (
            <div key={id} className={`ptab${currentTab === id ? ' active' : ''}`}>
              <NavLink to={`/projects/${project.id}/${id}`} role="tab" aria-selected={currentTab === id}>
                <tab.Icon size={16} strokeWidth={1.9} />
                {tab.label}
              </NavLink>
              {currentTab === id && (
                <TabMenu index={index} count={project.tabs.length} onMove={(d) => moveTab(index, d)} onRemove={() => removeTab(id)} />
              )}
            </div>
          )
        })}
        <AddTabMenu hidden={hidden} onAdd={addTab} />
      </div>
      {tabError && <div className="form-alert" role="alert">{tabError}</div>}

      <div className="project-body">
        <Outlet context={{ project, members, models, setProject }} />
      </div>
    </div>
  )
}

/** /projects/:id → first visible tab. */
export function ProjectIndex() {
  const { project } = useOutletContext()
  return <Navigate to={project.tabs[0]} replace />
}

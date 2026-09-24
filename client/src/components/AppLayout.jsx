import { Bot, FolderKanban, House, Plus, Users } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from './Logo'
import { useAuth } from '../context/AuthContext'
import { ProjectsProvider, useProjects } from '../context/ProjectsContext'
import { initials } from '../lib/format'
import '../styles/dashboard.css'

const NAV = [
  { to: '/dashboard', label: 'For you', Icon: House },
  { to: '/projects', label: 'Projects', Icon: FolderKanban },
  { to: '/team', label: 'Team', Icon: Users },
  { label: 'Agents', Icon: Bot },
]

/** Small coloured square with the project key, like Jira's space avatar. */
export function ProjectAvatar({ project, size = 20 }) {
  const hue = [...project.key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span className="project-avatar" style={{ width: size, height: size, background: `hsl(${hue} 45% 42%)`, fontSize: size * 0.42 }}
      aria-hidden="true">
      {project.key.slice(0, 2)}
    </span>
  )
}

function Sidebar() {
  const { projects, loading } = useProjects()
  const navigate = useNavigate()

  return (
    <nav className="app-side" aria-label="Main">
      {NAV.map(({ to, label, Icon }) => to
        ? <NavLink key={label} to={to} end><Icon size={17} strokeWidth={1.8} />{label}</NavLink>
        : <span key={label} className="app-side-soon"><Icon size={17} strokeWidth={1.8} />{label}<small>soon</small></span>)}

      <div className="side-section">
        <span>PROJECTS</span>
        <button type="button" className="side-add" onClick={() => navigate('/projects?new=1')} aria-label="Create project" title="Create project">
          <Plus size={15} />
        </button>
      </div>
      {loading ? (
        <><span className="side-skeleton" /><span className="side-skeleton" /></>
      ) : projects.length === 0 ? (
        <p className="side-empty">No projects yet</p>
      ) : (
        <div className="side-projects">
          {projects.map((p) => (
            <NavLink key={p.id} to={`/projects/${p.id}`} title={p.name}>
              <ProjectAvatar project={p} />
              <span className="side-project-name">{p.name}</span>
            </NavLink>
          ))}
        </div>
      )}
    </nav>
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
    <ProjectsProvider>
      <div className="app-shell">
        <header className="app-top">
          <Logo to="/dashboard" className="logo-light" />
          <div className="app-user">
            {user.avatar
              ? <img src={user.avatar} alt="" referrerPolicy="no-referrer" />
              : <span className="app-avatar">{initials(user.name)}</span>}
            <span className="app-user-name">{user.name}</span>
            <button type="button" onClick={handleLogout}>Sign out</button>
          </div>
        </header>
        <Sidebar />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </ProjectsProvider>
  )
}

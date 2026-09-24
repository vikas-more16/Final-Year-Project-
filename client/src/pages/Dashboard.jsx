import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import '../styles/dashboard.css'

const NAV = ['For you', 'Projects', 'Board', 'Backlog', 'Team', 'Agents', 'Reports']

function initials(name) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/', { replace: true })
  }

  return (
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
      <aside className="app-side">
        {NAV.map((item, i) => (
          <span key={item} className={i === 0 ? 'active' : ''}>{item}{i > 0 && <small>soon</small>}</span>
        ))}
      </aside>
      <main className="app-main">
        <p className="eyebrow eyebrow-dark">FOR YOU</p>
        <h1>Welcome, {user.name.split(' ')[0]}.</h1>
        <p className="app-lead">
          {/* You’re signed in as <b>{user.email}</b>{user.organization && <> at <b>{user.organization}</b></>} via {user.providers.join(' + ')}. */}
        </p>
        <div className="app-empty">
          <h2>Your workspace is ready</h2>
          <p>Projects, the board, team invitations and the AI agents arrive in the next build steps.</p>
        </div>
      </main>
    </div>
  )
}

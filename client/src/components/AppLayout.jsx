import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from './Logo'
import { useAuth } from '../context/AuthContext'
import { initials } from '../lib/format'
import '../styles/dashboard.css'

const NAV = [
  { to: '/dashboard', label: 'For you' },
  { to: '/projects', label: 'Projects' },
  { to: '/team', label: 'Team' },
  { label: 'Board' },
  { label: 'Backlog' },
  { label: 'Agents' },
  { label: 'Reports' },
]

export default function AppLayout() {
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
      <nav className="app-side" aria-label="Main">
        {NAV.map((item) => item.to
          ? <NavLink key={item.label} to={item.to} end>{item.label}</NavLink>
          : <span key={item.label} className="app-side-soon">{item.label}<small>soon</small></span>)}
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

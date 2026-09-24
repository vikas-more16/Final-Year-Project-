import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <>
      <p className="eyebrow eyebrow-dark">FOR YOU</p>
      <h1 className="page-title">Welcome, {user.name.split(' ')[0]}.</h1>
      <p className="app-lead">
        {/* You’re signed in as <b>{user.email}</b>{user.organization && <> at <b>{user.organization}</b></>} via {user.providers.join(' + ')}. */}
      </p>
      <div className="app-empty">
        <h2>Your workspace is ready</h2>
        <p>
          Start by <Link to="/projects">creating a project</Link>, then <Link to="/team">invite your team</Link> and
          assign them to it. The board and AI agents arrive in the next build steps.
        </p>
      </div>
    </>
  )
}

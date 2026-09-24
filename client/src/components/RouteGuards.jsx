import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function FullPageLoader() {
  return <div className="page-loader" role="status" aria-label="Loading"><span /></div>
}

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Login and register pages: signed-in users go straight to their dashboard. */
export function GuestRoute() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

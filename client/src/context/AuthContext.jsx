import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { getGoogleIdToken } from '../lib/firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api('/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (credentials) => {
    const data = await api('/auth/login', { method: 'POST', body: credentials })
    setUser(data.user)
  }, [])

  const register = useCallback(async (details) => {
    const data = await api('/auth/register', { method: 'POST', body: details })
    setUser(data.user)
  }, [])

  /** Resolves to false when the user closes the Google popup. */
  const loginWithGoogle = useCallback(async (remember = true) => {
    const idToken = await getGoogleIdToken()
    if (!idToken) return false
    const data = await api('/auth/google', { method: 'POST', body: { idToken, remember } })
    setUser(data.user)
    return true
  }, [])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {})
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, loginWithGoogle, logout }),
    [user, loading, login, register, loginWithGoogle, logout],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

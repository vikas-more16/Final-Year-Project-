import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'

const ProjectsContext = createContext(null)

/** Shares the manager's project list between the sidebar, the Projects page and project pages. */
export function ProjectsProvider({ children }) {
  const [projects, setProjects] = useState([])
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/projects')
      .then((data) => { setProjects(data.projects); setModels(data.models) })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const addProject = useCallback((project) => setProjects((list) => [project, ...list]), [])
  const updateProject = useCallback(
    (updated) => setProjects((list) => list.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))),
    [],
  )
  const removeProject = useCallback((id) => setProjects((list) => list.filter((p) => p.id !== id)), [])

  const value = useMemo(
    () => ({ projects, models, loading, error, addProject, updateProject, removeProject }),
    [projects, models, loading, error, addProject, updateProject, removeProject],
  )
  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProjects() {
  const ctx = useContext(ProjectsContext)
  if (!ctx) throw new Error('useProjects must be used inside <ProjectsProvider>')
  return ctx
}

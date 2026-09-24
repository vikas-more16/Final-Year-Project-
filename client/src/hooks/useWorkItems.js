import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

/** Loads a project's work items, sprints and members; `reload()` refreshes after changes. */
export function useWorkItems(projectId) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    api(`/projects/${projectId}/work-items`)
      .then((res) => { if (!cancelled) { setData(res); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [projectId, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, loading: !data && !error, reload }
}

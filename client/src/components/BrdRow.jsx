import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { BRD_ACCEPT, brdProblem, fileKind, formatBytes } from '../lib/files'

/** Shows a project's BRD with download, and lets the manager upload or replace it. */
export function BrdRow({ project, onReplaced, onError }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function upload(file) {
    if (!file) return
    const problem = brdProblem(file)
    if (problem) return onError(problem)
    const body = new FormData()
    body.append('brd', file)
    setBusy(true)
    try {
      const { project: updated } = await api(`/projects/${project.id}/brd`, { method: 'PUT', body })
      onReplaced(updated)
    } catch (err) {
      onError(err.message)
    }
    setBusy(false)
    inputRef.current.value = ''
  }

  return (
    <div className="brd-row">
      <input ref={inputRef} type="file" accept={BRD_ACCEPT} hidden onChange={(e) => upload(e.target.files[0])} />
      {project.brd ? (
        <>
          <span className="file-kind file-kind-sm">{fileKind(project.brd.name)}</span>
          <a className="brd-link" href={`/api/projects/${project.id}/brd`} title={`Download ${project.brd.name}`}>
            {project.brd.name}
          </a>
          <small>{formatBytes(project.brd.size)}</small>
        </>
      ) : <span className="muted">No BRD uploaded</span>}
      <button type="button" className="link-button" onClick={() => inputRef.current.click()} disabled={busy}>
        {busy ? 'Uploading…' : project.brd ? 'Replace' : 'Upload'}
      </button>
    </div>
  )
}

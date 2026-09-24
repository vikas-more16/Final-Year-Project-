import { useRef, useState } from 'react'
import { BRD_ACCEPT, fileKind, formatBytes } from '../lib/files'

export function FileDrop({ id, file, onChange, error }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const pick = (files) => { if (files?.[0]) onChange(files[0]) }

  if (file) {
    return (
      <div className={`file-chip${error ? ' has-error' : ''}`}>
        <span className="file-kind">{fileKind(file.name)}</span>
        <span className="file-meta"><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></span>
        <button type="button" className="link-button danger" onClick={() => onChange(null)}>Remove</button>
      </div>
    )
  }

  return (
    <label
      htmlFor={id}
      className={`file-drop${dragging ? ' dragging' : ''}${error ? ' has-error' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files) }}
    >
      <input ref={inputRef} id={id} type="file" accept={BRD_ACCEPT} onChange={(e) => pick(e.target.files)} />
      <span className="file-drop-icon" aria-hidden="true">⇪</span>
      <span><b>Drop your BRD here</b> or <u>browse</u></span>
      <small>PDF, DOCX, TXT or MD · up to 10 MB</small>
    </label>
  )
}

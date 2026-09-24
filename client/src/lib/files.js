export const BRD_ACCEPT = '.pdf,.docx,.txt,.md'
export const BRD_MAX_BYTES = 10 * 1024 * 1024

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Quick client-side check; the server re-validates the file contents. */
export function brdProblem(file) {
  if (!file) return 'Upload the Business Requirements Document (BRD)'
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
  if (!BRD_ACCEPT.split(',').includes(ext)) return 'Upload a PDF, DOCX, TXT or MD file'
  if (file.size > BRD_MAX_BYTES) return 'The BRD must be 10 MB or smaller'
  if (file.size === 0) return 'The selected file is empty'
  return null
}

export function fileKind(name = '') {
  return name.slice(name.lastIndexOf('.') + 1).toUpperCase()
}

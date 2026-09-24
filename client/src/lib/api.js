export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message)
    this.status = status
    this.fields = fields ?? {}
  }
}

/** JSON by default; pass a FormData body for file uploads (the browser sets the multipart boundary). */
export async function api(path, { method = 'GET', body } = {}) {
  const isForm = body instanceof FormData
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body && !isForm ? JSON.stringify(body) : body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data.message || 'Unable to reach the server', data.fields)
  }
  return data
}

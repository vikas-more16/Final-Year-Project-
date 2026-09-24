import { HttpError } from '../utils/HttpError.js'

export function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`))
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err?.code === 11000) {
    return res.status(409).json({ message: 'An account with this email already exists' })
  }
  const status = err instanceof HttpError ? err.status : 500
  if (status === 500) console.error(err)
  res.status(status).json({
    message: status === 500 ? 'Something went wrong' : err.message,
    ...(err.fields && { fields: err.fields }),
  })
}

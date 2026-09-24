import { User } from '../models/User.js'
import { COOKIE_NAME, verifyToken } from '../utils/token.js'
import { HttpError } from '../utils/HttpError.js'

export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return next(new HttpError(401, 'Not authenticated'))

  try {
    const { sub } = verifyToken(token)
    const user = await User.findById(sub)
    if (!user) return next(new HttpError(401, 'Account no longer exists'))
    req.user = user
    next()
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'))
  }
}

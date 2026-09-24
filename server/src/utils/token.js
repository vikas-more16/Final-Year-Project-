import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const COOKIE_NAME = 'orchestra_token'
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const cookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  path: '/',
}

export function issueSession(res, user, remember = true) {
  const token = jwt.sign({ sub: user._id.toString() }, env.jwtSecret, {
    expiresIn: remember ? env.jwtExpiresIn : '1d',
  })
  // Without "remember me" the cookie lives only for the browser session.
  res.cookie(COOKIE_NAME, token, remember ? { ...cookieOptions, maxAge: SEVEN_DAYS_MS } : cookieOptions)
}

export function clearSession(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions)
}

export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret)
}

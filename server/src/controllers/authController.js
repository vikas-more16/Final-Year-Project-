import { User } from '../models/User.js'
import { firebaseAuth } from '../config/firebase.js'
import { HttpError } from '../utils/HttpError.js'
import { clearSession, issueSession } from '../utils/token.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateRegistration({ name, email, organization, password }) {
  const fields = {}
  if (!name?.trim() || name.trim().length < 2) fields.name = 'Enter your full name'
  if (!EMAIL_RE.test(email ?? '')) fields.email = 'Enter a valid email address'
  const org = typeof organization === 'string' ? organization.trim() : ''
  if (org.length < 2) fields.organization = 'Enter the organization you work for'
  else if (org.length > 100) fields.organization = 'Organization name must be under 100 characters'
  if (typeof password !== 'string' || password.length < 8) {
    fields.password = 'Password must be at least 8 characters'
  } else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    fields.password = 'Password must contain letters and numbers'
  }
  if (Object.keys(fields).length) throw new HttpError(422, 'Please fix the highlighted fields', fields)
}

export async function register(req, res) {
  validateRegistration(req.body)
  const { name, email, organization, password, remember } = req.body

  const existing = await User.findOne({ email: email.toLowerCase().trim() })
  if (existing) {
    // A Google-only account cannot get a password this way: nobody has proven they own the inbox.
    const message = existing.providers.includes('password')
      ? 'An account with this email already exists'
      : 'This email is registered with Google. Use "Continue with Google" to sign in.'
    throw new HttpError(409, message, { email: message })
  }

  const user = await User.create({
    name: name.trim(),
    email,
    organization: organization.trim(),
    password,
    providers: ['password'],
    lastLoginAt: new Date(),
  })
  issueSession(res, user, remember !== false)
  res.status(201).json({ user: user.toPublic() })
}

export async function login(req, res) {
  const { email, password, remember } = req.body
  if (!email || !password) throw new HttpError(400, 'Email and password are required')

  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password')
  if (user && !user.password) {
    throw new HttpError(400, 'This account uses Google sign-in. Use "Continue with Google".')
  }
  if (!user || !(await user.comparePassword(password))) {
    throw new HttpError(401, 'Incorrect email or password')
  }

  user.lastLoginAt = new Date()
  await user.save()
  issueSession(res, user, remember !== false)
  res.json({ user: user.toPublic() })
}

export async function googleLogin(req, res) {
  const { idToken, remember } = req.body
  if (!idToken) throw new HttpError(400, 'Missing Google credential')

  let claims
  try {
    claims = await firebaseAuth.verifyIdToken(idToken)
  } catch {
    throw new HttpError(401, 'Google sign-in could not be verified')
  }
  if (claims.firebase?.sign_in_provider !== 'google.com') {
    throw new HttpError(400, 'Unsupported sign-in provider')
  }
  if (!claims.email || !claims.email_verified) {
    throw new HttpError(400, 'Your Google account email is not verified')
  }

  const email = claims.email.toLowerCase()
  let user = await User.findOne({ $or: [{ googleId: claims.uid }, { email }] })

  if (!user) {
    user = new User({
      name: claims.name || email.split('@')[0],
      email,
      googleId: claims.uid,
      avatar: claims.picture,
      providers: ['google'],
    })
  } else {
    // Google has verified the inbox, so it is safe to link it to an existing password account.
    user.googleId ??= claims.uid
    user.avatar ??= claims.picture
    if (!user.providers.includes('google')) user.providers.push('google')
  }

  user.lastLoginAt = new Date()
  await user.save()
  issueSession(res, user, remember !== false)
  res.json({ user: user.toPublic() })
}

export function me(req, res) {
  res.json({ user: req.user.toPublic() })
}

export function logout(_req, res) {
  clearSession(res)
  res.json({ message: 'Signed out' })
}

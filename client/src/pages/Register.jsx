import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout, Field } from '../components/AuthLayout'
import { GoogleButton } from '../components/GoogleButton'
import { useAuth } from '../context/AuthContext'

function validate({ name, email, organization, password, confirm }) {
  const errors = {}
  if (name.trim().length < 2) errors.name = 'Enter your full name'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address'
  if (organization.trim().length < 2) errors.organization = 'Enter the organization you work for'
  if (password.length < 8) errors.password = 'Use at least 8 characters'
  else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'Use both letters and numbers'
  if (confirm !== password) errors.confirm = 'Passwords do not match'
  return errors
}

function strength(password) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++
  return score
}

export default function Register() {
  const { register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', organization: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(null)

  const update = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    if (errors[e.target.name]) setErrors({ ...errors, [e.target.name]: undefined })
  }
  const score = strength(form.password)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy('password')
    try {
      await register({ name: form.name, email: form.email, organization: form.organization, password: form.password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setErrors(err.fields ?? {})
      if (!err.fields || !Object.keys(err.fields).length) setError(err.message)
      setBusy(null)
    }
  }

  async function handleGoogle() {
    setError('')
    setBusy('google')
    try {
      if (await loginWithGoogle()) return navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  return (
    <AuthLayout eyebrow="GET STARTED" title="Create your manager account" subtitle="Set up a workspace and let your agents handle the busywork.">
      {error && <div className="form-alert" role="alert">{error}</div>}
      <GoogleButton onClick={handleGoogle} disabled={!!busy}>
        {busy === 'google' ? 'Waiting for Google…' : 'Sign up with Google'}
      </GoogleButton>
      <div className="divider"><span>OR WITH EMAIL</span></div>
      <form onSubmit={handleSubmit} noValidate>
        <Field id="name" label="Full name" icon="☺" error={errors.name}>
          <input id="name" name="name" autoComplete="name" placeholder="Priya Sharma" value={form.name} onChange={update}
            aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} />
        </Field>
        <Field id="email" label="Work email" icon="@" error={errors.email}>
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" value={form.email}
            onChange={update} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />
        </Field>
        <Field id="organization" label="Organization" icon="◆" error={errors.organization}>
          <input id="organization" name="organization" autoComplete="organization" placeholder="e.g. Northstar Labs"
            maxLength={100} value={form.organization} onChange={update} aria-invalid={!!errors.organization}
            aria-describedby={errors.organization ? 'organization-error' : undefined} />
        </Field>
        <Field id="password" label="Password" icon="•••" error={errors.password}>
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
            placeholder="At least 8 characters" value={form.password} onChange={update}
            aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} />
          <button className="reveal-button" type="button" onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'HIDE' : 'SHOW'}</button>
        </Field>
        {form.password && (
          <div className={`strength strength-${score}`} aria-hidden="true">
            <span /><span /><span /><span />
            <small>{['Too weak', 'Weak', 'Fair', 'Good', 'Strong'][score]}</small>
          </div>
        )}
        <Field id="confirm" label="Confirm password" icon="•••" error={errors.confirm}>
          <input id="confirm" name="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password"
            placeholder="Repeat your password" value={form.confirm} onChange={update}
            aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? 'confirm-error' : undefined} />
        </Field>
        <button className="submit-button" type="submit" disabled={!!busy}>
          {busy === 'password' ? 'Creating account…' : <>Create account <span aria-hidden="true">→</span></>}
        </button>
      </form>
      <p className="form-footer">Already have an account? <Link to="/login">Sign in</Link></p>
    </AuthLayout>
  )
}

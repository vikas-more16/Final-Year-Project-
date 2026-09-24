import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthLayout, Field } from '../components/AuthLayout'
import { GoogleButton } from '../components/GoogleButton'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login, loginWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const goNext = () => navigate(location.state?.from || '/dashboard', { replace: true })
  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy('password')
    try {
      await login({ ...form, remember })
      goNext()
    } catch (err) {
      setError(err.message)
      setBusy(null)
    }
  }

  async function handleGoogle() {
    setError('')
    setBusy('google')
    try {
      if (await loginWithGoogle(remember)) return goNext()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  return (
    <AuthLayout eyebrow="WELCOME BACK" title="Sign in to your workspace" subtitle="Pick up where your agents left off.">
      {error && <div className="form-alert" role="alert">{error}</div>}
      <form onSubmit={handleSubmit}>
        <Field id="email" label="Work email" icon="@">
          <input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com"
            value={form.email} onChange={update} required />
        </Field>
        <Field id="password" label="Password" icon="•••">
          <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password"
            placeholder="Enter your password" value={form.password} onChange={update} required />
          <button className="reveal-button" type="button" onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'HIDE' : 'SHOW'}</button>
        </Field>
        <label className="check-row">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="custom-check" />
          <span>Keep me signed in</span>
        </label>
        <button className="submit-button" type="submit" disabled={!!busy}>
          {busy === 'password' ? 'Signing in…' : <>Enter workspace <span aria-hidden="true">→</span></>}
        </button>
      </form>
      <div className="divider"><span>OR</span></div>
      <GoogleButton onClick={handleGoogle} disabled={!!busy}>
        {busy === 'google' ? 'Waiting for Google…' : 'Continue with Google'}
      </GoogleButton>
      <p className="form-footer">New to Orchestra? <Link to="/register">Create an account</Link></p>
    </AuthLayout>
  )
}

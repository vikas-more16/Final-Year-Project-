import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { api } from '../lib/api'
import '../styles/team.css'

export default function Invite() {
  const { token } = useParams()
  const [invite, setInvite] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    api(`/invites/${token}`)
      .then((data) => setInvite(data.invite))
      .catch((err) => setError(err.message))
  }, [token])

  async function respond(action) {
    setBusy(action)
    setError('')
    try {
      const data = await api(`/invites/${token}/${action}`, { method: 'POST' })
      setInvite(data.invite)
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }

  let body
  if (!invite && !error) {
    body = <div className="panel-state"><span className="spinner" /> Loading invitation…</div>
  } else if (!invite) {
    body = (
      <>
        <h1>Invitation not found</h1>
        <p className="invite-text">{error}</p>
      </>
    )
  } else if (invite.status === 'active') {
    body = (
      <>
        <span className="invite-icon invite-icon-ok" aria-hidden="true">✓</span>
        <h1>You’re on the team!</h1>
        <p className="invite-text">
          You are now an <b>active</b> member of <b>{invite.organization}</b> as <b>{invite.role}</b>.
          {' '}{invite.inviterName} can now assign you work in Orchestra.
        </p>
      </>
    )
  } else if (invite.status === 'declined') {
    body = (
      <>
        <h1>Invitation declined</h1>
        <p className="invite-text">You declined the invitation to {invite.organization}. If this was a mistake, ask {invite.inviterName} to invite you again.</p>
      </>
    )
  } else if (invite.status === 'expired') {
    body = (
      <>
        <h1>This invitation has expired</h1>
        <p className="invite-text">Ask {invite.inviterName} to resend your invitation to {invite.organization}.</p>
      </>
    )
  } else {
    body = (
      <>
        <p className="eyebrow eyebrow-dark">TEAM INVITATION</p>
        <h1>Join {invite.organization}</h1>
        <p className="invite-text">
          Hi {invite.name.split(' ')[0]}, <b>{invite.inviterName}</b> invited you to collaborate on Orchestra.
        </p>
        <dl className="invite-details">
          <div><dt>Email</dt><dd>{invite.email}</dd></div>
          <div><dt>Role</dt><dd>{invite.role}</dd></div>
          <div>
            <dt>Projects</dt>
            <dd>{invite.projects.length
              ? invite.projects.map((p) => <span key={p.key} className="invite-project"><span className="key-badge">{p.key}</span> {p.name}</span>)
              : 'None assigned yet'}</dd>
          </div>
          <div><dt>Expires</dt><dd>{new Date(invite.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</dd></div>
        </dl>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <div className="invite-actions">
          <button type="button" className="btn-primary" onClick={() => respond('accept')} disabled={!!busy}>
            {busy === 'accept' ? 'Accepting…' : 'Accept invitation'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => respond('decline')} disabled={!!busy}>
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </>
    )
  }

  return (
    <main className="invite-page">
      <Logo />
      <section className="invite-card">{body}</section>
      <p className="invite-foot"><Link to="/">What is Orchestra?</Link></p>
    </main>
  )
}

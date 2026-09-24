import { useState } from 'react'
import './App.css'

function App() {
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [step, setStep] = useState('login')
  const [organizationName, setOrganizationName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState('Team member')
  const [members, setMembers] = useState([])

  return (
    <main className="login-shell">
      <section className="brand-panel">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><span>ORCHESTRA</span></div>
        <div className="brand-copy">
          <p className="eyebrow">MULTI-AGENT WORKFLOW ENGINE</p>
          <h1>Move ideas from<br /><em>intent to impact.</em></h1>
          <p className="intro">Coordinate intelligent agents, automate the busywork, and keep every project moving in one clear direction.</p>
        </div>
        <div className="flow-preview" aria-label="Workflow activity preview">
          <div className="preview-heading"><span>ACTIVE WORKFLOW</span><span className="live-dot">LIVE</span></div>
          <div className="flow-line"><span className="node node-done">&#10003;</span><span>Research brief</span><small>COMPLETE</small></div>
          <div className="connector"></div>
          <div className="flow-line"><span className="node node-active"><span></span></span><span>Product strategy</span><small>RUNNING</small></div>
          <div className="connector"></div>
          <div className="flow-line muted"><span className="node">3</span><span>Launch plan</span><small>QUEUED</small></div>
        </div>
      </section>
      <section className="form-panel">
        <div className="form-wrap">
          <div className="mobile-brand brand-lockup"><span className="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span><span>ORCHESTRA</span></div>
          <div className="form-intro"><p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace</h2><p>Pick up where your agents left off.</p></div>
          {step === 'login' ? <form onSubmit={(event) => { event.preventDefault(); setStep('organization') }}>
            <label htmlFor="email">Work email</label><div className="input-wrap"><span className="input-icon">@</span><input id="email" type="email" placeholder="you@company.com" required /></div>
            <div className="label-row"><label htmlFor="password">Password</label><a href="#reset">Forgot password?</a></div><div className="input-wrap"><span className="input-icon password-icon">&#9679;</span><input id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password" minLength="6" required /><button className="reveal-button" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'HIDE' : 'SHOW'}</button></div>
            <label className="check-row"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span className="custom-check"></span><span>Keep me signed in</span></label><button className="submit-button" type="submit">Enter workspace <span aria-hidden="true">&#8594;</span></button>
          </form> : step === 'organization' ? <OrganizationSetup organizationName={organizationName} setOrganizationName={setOrganizationName} memberEmail={memberEmail} setMemberEmail={setMemberEmail} memberRole={memberRole} setMemberRole={setMemberRole} members={members} setMembers={setMembers} onComplete={() => setStep('complete')} /> : <div className="success-message" role="status"><span>&#10003;</span><div><strong>{organizationName} is ready.</strong><p>Your team workspace is ready to orchestrate.</p></div></div>}
          {step === 'login' && <><div className="divider"><span>OR CONTINUE WITH</span></div><button className="sso-button" type="button"><span className="google-mark">G</span> Sign in with Google</button><p className="form-footer">New to Orchestra? <a href="#request-access">Request access</a></p></>}
        </div><p className="legal">By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
      </section>
    </main>
  )
}

function OrganizationSetup({ organizationName, setOrganizationName, memberEmail, setMemberEmail, memberRole, setMemberRole, members, setMembers, onComplete }) {
  const addMember = (event) => {
    event.preventDefault()
    if (!memberEmail.trim()) return
    setMembers([...members, { email: memberEmail.trim(), role: memberRole }])
    setMemberEmail('')
  }

  return (
    <div className="organization-setup">
      <div className="setup-progress"><span className="progress-active">01</span><i></i><span>02</span></div>
      <div className="form-intro setup-intro"><p className="eyebrow">SET UP YOUR WORKSPACE</p><h2>Name your organization</h2><p>Start with the team that will bring your projects to life.</p></div>
      <label htmlFor="organization">Organization name</label>
      <div className="input-wrap"><span className="input-icon">&#9670;</span><input id="organization" value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="e.g. Northstar Labs" required /></div>
      <div className="team-heading"><div><p className="eyebrow">TEAM MEMBERS</p><strong>Invite your collaborators</strong></div><span>{members.length + 1} member{members.length === 0 ? '' : 's'}</span></div>
      <div className="member-row owner-row"><span className="avatar">YO</span><div><strong>You</strong><small>Workspace creator</small></div><span className="role-badge">Admin / Leader</span></div>
      {members.map((member, index) => <div className="member-row" key={`${member.email}-${index}`}><span className="avatar avatar-alt">{member.email.slice(0, 2).toUpperCase()}</span><div><strong>{member.email}</strong><small>{member.role}</small></div><button className="remove-member" type="button" aria-label={`Remove ${member.email}`} onClick={() => setMembers(members.filter((_, memberIndex) => memberIndex !== index))}>&#215;</button></div>)}
      <form className="invite-form" onSubmit={addMember}><label htmlFor="member-email">Add a team member</label><div className="invite-fields"><input id="member-email" type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="teammate@company.com" /><select value={memberRole} onChange={(event) => setMemberRole(event.target.value)} aria-label="Team member role"><option>Team member</option><option>Leader</option><option>Admin</option></select><button type="submit" aria-label="Add team member">+</button></div></form>
      <button className="submit-button setup-submit" type="button" disabled={!organizationName.trim()} onClick={onComplete}>Create organization <span aria-hidden="true">&#8594;</span></button>
      <p className="setup-note">You can invite more people and change roles later.</p>
    </div>
  )
}

export default App

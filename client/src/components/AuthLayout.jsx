import { Logo } from './Logo'

const FLOW = [
  { label: 'Requirement analysis', agent: 'Analyst agent', state: 'done' },
  { label: 'Sprint plan & timeline', agent: 'Planner agent', state: 'running' },
  { label: 'Assign tasks by skill', agent: 'Allocation agent', state: 'queued' },
]

export function AuthLayout({ eyebrow, title, subtitle, children }) {
  return (
    <main className="auth-shell">
      <section className="auth-brand">
        <Logo className="logo-light" />
        <div className="auth-brand-copy">
          <p className="eyebrow">MULTI-AGENT WORKFLOW ENGINE</p>
          <h1>Move projects from<br /><em>intent to impact.</em></h1>
          <p className="auth-intro">
            Specialised AI agents plan, assign, monitor and report, so you spend your time on decisions instead of status updates.
          </p>
        </div>
        <div className="flow-preview" aria-label="Example agent workflow">
          <div className="flow-heading"><span>ACTIVE WORKFLOW</span><span className="live-dot">LIVE</span></div>
          {FLOW.map((step, i) => (
            <div key={step.label}>
              {i > 0 && <div className="flow-connector" />}
              <div className={`flow-line flow-${step.state}`}>
                <span className="flow-node">{step.state === 'done' ? '✓' : step.state === 'running' ? <i /> : i + 1}</span>
                <span className="flow-text">{step.label}<small>{step.agent}</small></span>
                <span className="flow-state">{step.state.toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-form-wrap">
          <Logo className="auth-mobile-logo" />
          <div className="form-intro">
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
        <p className="legal">By continuing, you agree to Orchestra’s Terms and Privacy Policy.</p>
      </section>
    </main>
  )
}

export function Field({ id, label, error, icon, children, action }) {
  return (
    <div className="field">
      <div className="label-row">
        <label htmlFor={id}>{label}</label>
        {action}
      </div>
      <div className={`input-wrap${error ? ' has-error' : ''}`}>
        <span className="input-icon" aria-hidden="true">{icon}</span>
        {children}
      </div>
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}

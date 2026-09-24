import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo, LogoMark } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import '../styles/landing.css'

const AGENTS = [
  { icon: '◎', name: 'Orchestrator', role: 'Routes work between agents and keeps one consistent workflow state.' },
  { icon: '✎', name: 'Requirement Analyst', role: 'Turns briefs, notes and documents into structured, prioritised requirements.' },
  { icon: '▦', name: 'Project Planner', role: 'Builds epics, sprints, milestones and a realistic timeline with dependencies.' },
  { icon: '⇄', name: 'Task Allocator', role: 'Assigns every task to the right teammate based on skills and current workload.' },
  { icon: '◔', name: 'Progress Monitor', role: 'Watches the board around the clock, flags blockers and predicts delays early.' },
  { icon: '▤', name: 'Report Writer', role: 'Writes stand-up summaries, sprint reports and stakeholder updates for you.' },
]

const STEPS = [
  { title: 'Describe the project', text: 'Paste a brief or upload a requirements document. Add your team with their roles.' },
  { title: 'Agents build the plan', text: 'Requirements, backlog, sprints and assignments appear on your board in minutes.' },
  { title: 'Your team executes', text: 'Everyone works on a familiar board while the monitor agent tracks every change.' },
  { title: 'Reports write themselves', text: 'Daily summaries and sprint reports are generated and shared automatically.' },
]

const COMPARE = [
  ['Requirements', 'Collected by hand from stakeholders', 'Extracted and structured by the Analyst agent'],
  ['Planning', 'Plans and schedules built manually', 'Sprints and timelines generated with dependencies'],
  ['Assignment', 'Manager decides who does what', 'Matched by skill and workload automatically'],
  ['Tracking', 'Team updates statuses when they remember', 'Continuous monitoring with early delay alerts'],
  ['Reporting', 'Hours spent compiling status decks', 'Reports written and delivered on schedule'],
]

const BOARD = [
  { col: 'To Do', cards: [{ key: 'ORC-14', title: 'Payment gateway integration', who: 'SM', tag: 'Backend' }] },
  { col: 'In Progress', cards: [{ key: 'ORC-11', title: 'Login & Google auth', who: 'VM', tag: 'Auth', agent: true }] },
  { col: 'In Review', cards: [{ key: 'ORC-09', title: 'Landing page UI', who: 'YM', tag: 'Frontend' }] },
  { col: 'Done', cards: [{ key: 'ORC-03', title: 'Database schema', who: 'VK', tag: 'Data' }] },
]

function BoardPreview() {
  return (
    <div className="board-preview" aria-label="Preview of an Orchestra project board">
      <div className="bp-top">
        <span className="bp-dots"><i /><i /><i /></span>
        <span className="bp-title"><LogoMark size={14} /> Mobile Banking App · Sprint 3</span>
      </div>
      <div className="bp-columns">
        {BOARD.map(({ col, cards }) => (
          <div className="bp-col" key={col}>
            <p className="bp-col-title">{col} <span>{cards.length}</span></p>
            {cards.map((c) => (
              <div className={`bp-card${c.agent ? ' bp-card-live' : ''}`} key={c.key}>
                <p>{c.title}</p>
                <div className="bp-meta"><span className="bp-tag">{c.tag}</span><span className="bp-avatar">{c.who}</span></div>
                <small>{c.key}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="bp-agent-feed">
        <p><span className="pulse" /> <b>Monitor agent</b> ORC-11 is 2 days behind. Suggested moving ORC-14 to next sprint.</p>
        <p><span className="pulse pulse-gold" /> <b>Allocator agent</b> Assigned ORC-15 to Yash (frontend, 60% capacity).</p>
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="landing">
      <header className="nav">
        <div className="container nav-inner">
          <Logo className="logo-light" />
          <nav className={`nav-links${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)}>
            <a href="#agents">Agents</a>
            <a href="#how">How it works</a>
            <a href="#compare">Why Orchestra</a>
            {user ? (
              <Link className="btn btn-gold" to="/dashboard">Open dashboard</Link>
            ) : (
              <>
                <Link to="/login">Sign in</Link>
                <Link className="btn btn-gold" to="/register">Get started free</Link>
              </>
            )}
          </nav>
          <button className="nav-toggle" aria-label="Toggle menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">AI-NATIVE PROJECT MANAGEMENT</p>
            <h1>Your projects, run by a team of <em>AI agents.</em></h1>
            <p className="hero-sub">
              Orchestra is a multi-agent workflow engine that plans, assigns, tracks and reports on your projects,
              automating up to 90% of the manual coordination that eats a manager’s week.
            </p>
            <div className="hero-cta">
              <Link className="btn btn-gold btn-lg" to={user ? '/dashboard' : '/register'}>
                {user ? 'Go to dashboard' : 'Start orchestrating'} <span aria-hidden="true">→</span>
              </Link>
              <a className="btn btn-ghost btn-lg" href="#how">See how it works</a>
            </div>
            <ul className="hero-points">
              <li>Free for student &amp; small teams</li>
              <li>Sign up with Google in one click</li>
            </ul>
          </div>
          <BoardPreview />
        </div>
      </section>

      <section className="stats">
        <div className="container stats-grid">
          <div><strong>90%</strong><span>of routine PM tasks automated (target)</span></div>
          <div><strong>6</strong><span>specialised agents working together</span></div>
          <div><strong>50%</strong><span>less time spent on coordination (target)</span></div>
          <div><strong>24/7</strong><span>monitoring of every task and deadline</span></div>
        </div>
      </section>

      <section className="section" id="agents">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow-dark">MEET YOUR AGENTS</p>
            <h2>A specialist for every part of the job</h2>
            <p>Each agent owns one responsibility and shares a single project memory, so nothing falls through the cracks between planning and delivery.</p>
          </div>
          <div className="agent-grid">
            {AGENTS.map((a, i) => (
              <article className={`agent-card${i === 0 ? ' agent-card-lead' : ''}`} key={a.name}>
                <span className="agent-icon" aria-hidden="true">{a.icon}</span>
                <h3>{a.name} <small>agent</small></h3>
                <p>{a.role}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-tint" id="how">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow-dark">HOW IT WORKS</p>
            <h2>From brief to running sprint in four steps</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section" id="compare">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow-dark">WHY ORCHESTRA</p>
            <h2>Trackers store work. Orchestra does it.</h2>
            <p>Traditional tools are data repositories that wait for humans to act. Orchestra’s agents plan, prioritise and follow up on their own.</p>
          </div>
          <div className="compare" role="table" aria-label="Traditional tools compared with Orchestra">
            <div className="compare-row compare-head" role="row">
              <span role="columnheader">Stage</span>
              <span role="columnheader">Traditional tools</span>
              <span role="columnheader"><LogoMark size={16} /> Orchestra</span>
            </div>
            {COMPARE.map(([stage, before, after]) => (
              <div className="compare-row" role="row" key={stage}>
                <span role="cell" className="compare-stage">{stage}</span>
                <span role="cell" className="compare-before">{before}</span>
                <span role="cell" className="compare-after">{after}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="container cta-inner">
          <h2>Let the agents handle the busywork.</h2>
          <p>Create your workspace, invite your team, and watch your first plan come together.</p>
          <Link className="btn btn-gold btn-lg" to={user ? '/dashboard' : '/register'}>
            {user ? 'Open dashboard' : 'Create free account'} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <Logo className="logo-light" />
          <p>A Multi-Agent Workflow Engine for Automated Project Management and Execution.<br />
            Department of CSE, SSGMCE Shegaon · {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  )
}

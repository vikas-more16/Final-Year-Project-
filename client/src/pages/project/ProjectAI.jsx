import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Send, Sparkles, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { fmtDate } from '../../lib/workItems'

const SECTIONS = [
  { id: 'orchestrator', label: 'Orchestrator' },
  { id: 'memory', label: 'Project memory' },
  { id: 'audit', label: 'Audit trail' },
  { id: 'settings', label: 'Settings' },
]
const SUGGESTIONS = [
  'What is blocked right now and why?',
  'Which tasks are pending assignment?',
  'Are we on track for the deadline?',
  'Assign the vacant tasks',
]
const PLANNING_LABEL = {
  idle: 'Not planned yet', running: 'Planning…', awaiting_clarification: 'Waiting for your answers', planned: 'Planned', failed: 'Last run failed',
}
const ago = (d) => {
  const s = Math.round((Date.now() - new Date(d)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(d).toLocaleDateString()
}
const duration = (r) => (r.finishedAt ? `${Math.max(1, Math.round((new Date(r.finishedAt) - new Date(r.startedAt)) / 1000))}s` : '')

function RunIcon({ status }) {
  if (status === 'running' || status === 'queued') return <span className="spinner spinner-sm" aria-label="Running" />
  if (status === 'succeeded') return <CheckCircle2 size={16} className="ok" aria-label="Succeeded" />
  if (status === 'awaiting_input') return <CircleDashed size={16} className="warn" aria-label="Waiting for input" />
  return <XCircle size={16} className="bad" aria-label="Failed" />
}

function RunList({ runs }) {
  const [open, setOpen] = useState(null)
  if (!runs.length) return <p className="card-text">No agent runs yet.</p>
  return (
    <ul className="run-list">
      {runs.map((r) => (
        <li key={r._id}>
          <button type="button" className="run-head" onClick={() => setOpen(open === r._id ? null : r._id)}>
            <RunIcon status={r.status} />
            <span className="run-title"><strong>{r.agent}</strong> · {r.action.replaceAll('_', ' ')}</span>
            <span className="muted">{ago(r.createdAt)}</span>
            {open === r._id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          {(r.summary || r.error) && <p className={`run-summary${r.error ? ' bad' : ''}`}>{r.error ?? r.summary}</p>}
          {open === r._id && (
            <div className="run-detail">
              <small>Trigger {r.trigger} · {r.llm.calls} LLM call(s) · {r.llm.tokens.toLocaleString()} tokens {duration(r) && `· ${duration(r)}`}</small>
              <ol>{r.steps.map((s, i) => <li key={i}>{s.message}</li>)}</ol>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function Chat({ state, projectId, onSent }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)
  const prompts = state.memory.prompts
  const waiting = state.runs.some((r) => r.action === 'handle_prompt' && (r.status === 'running' || r.status === 'queued'))

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [prompts.length, waiting])

  async function send(message) {
    const body = (message ?? text).trim()
    if (!body) return
    setSending(true)
    setError('')
    try {
      await api(`/projects/${projectId}/ai/prompt`, { method: 'POST', body: { text: body } })
      setText('')
      onSent()
    } catch (err) {
      setError(err.message)
    }
    setSending(false)
  }

  return (
    <section className="card chat">
      <h2><Bot size={18} /> Orchestrator</h2>
      <div className="chat-log" aria-live="polite">
        {prompts.length === 0 && !waiting && (
          <p className="card-text">Ask about the plan, add requirements, change the deadline, or give instructions such as “use Tailwind CSS”. Everything you say is stored in Project Memory and used by every agent.</p>
        )}
        {prompts.map((p, i) => (
          <div key={i} className="chat-turn">
            <div className="bubble bubble-user">{p.text}</div>
            {p.response
              ? <div className="bubble bubble-ai"><span className="intent-tag">{p.intent?.replaceAll('_', ' ')}</span>{p.response}</div>
              : <div className="bubble bubble-ai muted">Working on it…</div>}
          </div>
        ))}
        {waiting && prompts.at(-1)?.response && <div className="bubble bubble-ai muted"><span className="spinner spinner-sm" /> Thinking…</div>}
        <span ref={endRef} />
      </div>
      <div className="suggestions">
        {SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)} disabled={sending || !state.configured}>{s}</button>)}
      </div>
      {error && <div className="form-alert" role="alert">{error}</div>}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send() }}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the Orchestrator…" maxLength={4000}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} disabled={!state.configured} aria-label="Message" />
        <button type="submit" className="btn-primary" disabled={sending || !text.trim() || !state.configured} aria-label="Send"><Send size={16} /></button>
      </form>
    </section>
  )
}

function Approvals({ pending, projectId, onDone }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  async function decide(id, decision) {
    setBusy(id)
    setError('')
    try {
      await api(`/projects/${projectId}/ai/approvals/${id}`, { method: 'POST', body: { decision } })
      onDone()
    } catch (err) {
      setError(err.message)
    }
    setBusy(null)
  }
  return (
    <section className="card">
      <h2>Pending approvals <span className="count">{pending.length}</span></h2>
      {error && <div className="form-alert">{error}</div>}
      {pending.length === 0 ? <p className="card-text">Nothing needs your approval.</p> : pending.map((p) => (
        <div key={p._id} className="approval">
          <strong>{p.title}</strong>
          {p.summary && <p>{p.summary}</p>}
          {p.payload?.epics && <ul>{p.payload.epics.map((e) => <li key={e.name}>{e.name} · {e.stories} stories, {e.tasks} tasks</li>)}</ul>}
          {p.reason && <small>Why: {p.reason}</small>}
          <div className="approval-actions">
            <button type="button" className="btn-secondary" disabled={busy === p._id} onClick={() => decide(p._id, 'reject')}>Reject</button>
            <button type="button" className="btn-primary" disabled={busy === p._id} onClick={() => decide(p._id, 'approve')}>Approve</button>
          </div>
        </div>
      ))}
    </section>
  )
}

function Clarifications({ items, projectId, onDone }) {
  const open = items.filter((c) => !c.answer)
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState('')
  if (!open.length) return null
  async function submit(index) {
    setError('')
    try {
      await api(`/projects/${projectId}/ai/clarifications/${index}`, { method: 'POST', body: { answer: answers[index] } })
      onDone()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <section className="card card-attention">
      <h2>Questions from the Planning Agent <span className="count">{open.length}</span></h2>
      {error && <div className="form-alert">{error}</div>}
      {open.map((c) => (
        <form key={c.index} className="clarification" onSubmit={(e) => { e.preventDefault(); submit(c.index) }}>
          <strong>{c.critical && <span className="critical-tag">Blocking</span>}{c.question}</strong>
          {c.reason && <small>{c.reason}</small>}
          <div className="inline-form">
            <input className="text-input" value={answers[c.index] ?? ''} onChange={(e) => setAnswers({ ...answers, [c.index]: e.target.value })} placeholder="Your answer" />
            <button type="submit" className="btn-primary" disabled={!answers[c.index]?.trim()}>Answer</button>
          </div>
        </form>
      ))}
    </section>
  )
}

function RiskBanner({ risk }) {
  if (!risk) return null
  return (
    <div className="banner banner-risk">
      <AlertTriangle size={18} />
      <div>
        <strong>⚠️ Schedule risk: {risk.differenceDays} day{risk.differenceDays === 1 ? '' : 's'} late</strong>
        <span>Estimated completion {fmtDate(risk.estimatedCompletion, { dateStyle: 'long' })} · required deadline {fmtDate(risk.deadline, { dateStyle: 'long' })}</span>
        <span>{risk.reasons.join(' ')}</span>
      </div>
    </div>
  )
}

function Overview({ state, project, onChange }) {
  const [error, setError] = useState('')
  const { planning } = state.memory
  const current = state.runs.find((r) => r.status === 'running' || r.status === 'queued')

  async function plan() {
    setError('')
    try {
      await api(`/projects/${project.id}/ai/plan`, { method: 'POST' })
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <div className="ai-status">
        <div className="ai-agents">
          {state.agents.map((a) => (
            <span key={a.name} className="agent-chip" title={a.description}><Sparkles size={14} />{a.label}</span>
          ))}
          <span className="muted model-note">Models: {state.models.planner} · {state.models.fast}</span>
        </div>
        <div className="ai-plan">
          <span className={`plan-state plan-${planning.status}`}>{PLANNING_LABEL[planning.status]}</span>
          {planning.lastPlannedAt && <span className="muted">last planned {ago(planning.lastPlannedAt)}</span>}
          <button type="button" className="btn-primary" onClick={plan} disabled={state.busy || !project.brd || !state.configured}
            title={!project.brd ? 'Upload a BRD first' : undefined}>
            <Sparkles size={15} /> {planning.lastPlannedAt ? 'Plan new requirements' : 'Plan project with AI'}
          </button>
        </div>
      </div>
      {!state.configured && <div className="form-alert">The server has no LLM configured. Set LLM_BASE_URL and LLM_API_KEY in server/.env.</div>}
      {error && <div className="form-alert" role="alert">{error}</div>}
      <RiskBanner risk={planning.scheduleRisk} />
      {planning.vacantRoles?.length > 0 && (
        <div className="banner banner-vacant"><AlertTriangle size={16} />
          <div><strong>Vacant roles: {planning.vacantRoles.join(', ')}</strong>
            <span>Tasks needing these roles stay in the plan as Pending Assignment. <Link to="/team">Invite a team member</Link> and the Orchestrator assigns them automatically.</span></div>
        </div>
      )}
      {current && (
        <div className="live-run">
          <span className="spinner spinner-sm" />
          <div>
            <strong>{current.agent} agent · {current.action.replaceAll('_', ' ')}</strong>
            <span>{current.steps.at(-1)?.message ?? 'Starting…'}</span>
            <small>{current.steps.length} step(s) · {current.llm.calls} LLM call(s) so far. Planning is paced to the provider’s rate limit and can take a few minutes.</small>
          </div>
        </div>
      )}
      <div className="ai-grid">
        <Chat state={state} projectId={project.id} onSent={onChange} />
        <div className="ai-side">
          <Clarifications items={state.memory.clarifications} projectId={project.id} onDone={onChange} />
          <Approvals pending={state.pending} projectId={project.id} onDone={onChange} />
          <section className="card">
            <h2>Agent runs</h2>
            <RunList runs={state.runs} />
          </section>
        </div>
      </div>
    </>
  )
}

function MemoryView({ state }) {
  const { info, brd, instructions, decisions } = state.memory
  const [type, setType] = useState('all')
  const types = ['all', ...new Set(brd.requirements.map((r) => r.type))]
  const reqs = brd.requirements.filter((r) => type === 'all' || r.type === type)
  const list = (title, items) => items?.length > 0 && (
    <div className="mem-block"><h3>{title}</h3><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  )
  return (
    <div className="memory">
      <section className="card">
        <h2>Project information</h2>
        {info.summary ? <p className="card-text">{info.summary}</p> : <p className="card-text">The Planning Agent fills this in from the BRD.</p>}
        <dl className="facts">
          <div><dt>Start</dt><dd>{fmtDate(info.startDate, { dateStyle: 'long' })}</dd></div>
          <div><dt>Deadline</dt><dd>{fmtDate(info.deadline, { dateStyle: 'long' })}</dd></div>
          <div><dt>BRD</dt><dd>{brd.analyzedAt ? `Analysed ${ago(brd.analyzedAt)} · ${brd.textChars?.toLocaleString()} characters` : 'Not analysed yet'}</dd></div>
        </dl>
        <div className="mem-grid">
          {list('Objectives', info.objectives)}
          {list('In scope', info.scope)}
          {list('Out of scope', info.outOfScope)}
          {list('Constraints', info.constraints)}
          {list('Technology stack', info.techStack)}
          {list('User roles', brd.userRoles)}
          {list('Workflows', brd.workflows)}
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Requirements <span className="count">{brd.requirements.length}</span></h2>
          <select className="text-input req-filter" value={type} onChange={(e) => setType(e.target.value)} aria-label="Requirement type">
            {types.map((t) => <option key={t} value={t}>{t === 'all' ? 'All types' : t.replace('_', '-')}</option>)}
          </select>
        </div>
        <div className="req-table">
          {reqs.map((r) => (
            <div key={r.id} className="req-row">
              <span className="req-id">{r.id}</span>
              <div>
                <p>{r.text}</p>
                <small>{r.type.replace('_', '-')}{r.area ? ` · ${r.area}` : ''}{r.source === 'user' ? ' · added in chat' : ''}</small>
                {r.acceptanceCriteria?.length > 0 && <ul>{r.acceptanceCriteria.map((a, i) => <li key={i}>{a}</li>)}</ul>}
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>Instructions and decisions</h2>
        {instructions.length + decisions.length === 0 && <p className="card-text">Instructions you give in chat (preferences, constraints, tech choices) appear here and guide every agent.</p>}
        <ul className="decisions">
          {instructions.map((d, i) => <li key={`i${i}`}><span className="intent-tag">instruction</span>{d.text}<small>{ago(d.at)}</small></li>)}
          {decisions.map((d, i) => <li key={`d${i}`}><span className="intent-tag">decision</span>{d.text}<small>{ago(d.at)}</small></li>)}
        </ul>
      </section>
    </div>
  )
}

function AuditView({ projectId }) {
  const [entries, setEntries] = useState([])
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(null)

  const fetchPage = useCallback(
    (before) => api(`/projects/${projectId}/ai/audit?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`),
    [projectId],
  )

  useEffect(() => {
    let cancelled = false
    fetchPage().then((res) => {
      if (cancelled) return
      setEntries(res.entries)
      setDone(res.entries.length < 50)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [fetchPage])

  async function loadOlder() {
    setLoading(true)
    const res = await fetchPage(entries.at(-1).at)
    setEntries((list) => [...list, ...res.entries])
    setDone(res.entries.length < 50)
    setLoading(false)
  }

  return (
    <section className="card">
      <h2>Audit trail</h2>
      <p className="card-text">Every important agent decision, with its reasoning and the state before and after.</p>
      <ol className="audit">
        {entries.map((e) => (
          <li key={e._id}>
            <button type="button" className="audit-head" onClick={() => setOpen(open === e._id ? null : e._id)}>
              <span className={`agent-badge agent-${e.agent}`}>{e.agent}</span>
              <span className="audit-action">{e.action.replaceAll('_', ' ')}</span>
              <span className="audit-decision">{e.decision}</span>
              <span className="muted">{new Date(e.at).toLocaleString()}</span>
            </button>
            {open === e._id && (
              <dl className="facts audit-detail">
                {e.reason && <div><dt>Reason</dt><dd>{e.reason}</dd></div>}
                {e.inputContext && <div><dt>Input</dt><dd>{e.inputContext}</dd></div>}
                {e.entityKey && <div><dt>Entity</dt><dd><Link to={`../board?task=${e.entityKey}`} relative="path">{e.entityKey}</Link></dd></div>}
                {e.previousState && <div><dt>Before</dt><dd><code>{JSON.stringify(e.previousState)}</code></dd></div>}
                {e.newState && <div><dt>After</dt><dd><code>{JSON.stringify(e.newState)}</code></dd></div>}
              </dl>
            )}
          </li>
        ))}
      </ol>
      {loading && <div className="panel-state"><span className="spinner" /> Loading…</div>}
      {!loading && entries.length === 0 && <p className="card-text">No activity yet.</p>}
      {!loading && !done && <button type="button" className="btn-secondary" onClick={loadOlder}>Load older entries</button>}
    </section>
  )
}

function SettingsView({ state, projectId, onSaved }) {
  const { planning, info } = state.memory
  const toInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '')
  const [form, setForm] = useState({
    approvals: Object.fromEntries(state.approvals.map((a) => [a.action, a.mode])),
    sprintLengthDays: planning.sprintLengthDays,
    startDate: toInput(info.startDate),
    deadline: toInput(info.deadline),
  })
  const [status, setStatus] = useState('')

  async function save(e) {
    e.preventDefault()
    setStatus('')
    try {
      await api(`/projects/${projectId}/ai/settings`, { method: 'PUT', body: { ...form, sprintLengthDays: Number(form.sprintLengthDays) } })
      setStatus('Saved. The schedule is being recalculated.')
      onSaved()
    } catch (err) {
      setStatus(err.message)
    }
  }

  return (
    <form className="settings" onSubmit={save}>
      <section className="card">
        <h2>Schedule</h2>
        <div className="form-grid-3">
          <div className="field"><label htmlFor="s-start">Project start</label>
            <input id="s-start" type="date" className="text-input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-deadline">Deadline</label>
            <input id="s-deadline" type="date" className="text-input" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></div>
          <div className="field"><label htmlFor="s-len">Sprint length (days)</label>
            <input id="s-len" type="number" min={5} max={30} className="text-input" value={form.sprintLengthDays} onChange={(e) => setForm({ ...form, sprintLengthDays: e.target.value })} /></div>
        </div>
      </section>
      <section className="card">
        <h2>Human approval</h2>
        <p className="card-text">Choose which agent actions run automatically and which wait for your approval.</p>
        <ul className="approval-settings">
          {state.approvals.map((a) => (
            <li key={a.action}>
              <span>{a.label}</span>
              <div className="segmented small" role="radiogroup" aria-label={a.label}>
                {['auto', 'approval'].map((mode) => (
                  <button key={mode} type="button" role="radio" aria-checked={form.approvals[a.action] === mode}
                    className={form.approvals[a.action] === mode ? 'active' : ''}
                    onClick={() => setForm({ ...form, approvals: { ...form.approvals, [a.action]: mode } })}>
                    {mode === 'auto' ? 'Automatic' : 'Needs approval'}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="settings-actions">
        {status && <span className="muted">{status}</span>}
        <button type="submit" className="btn-primary">Save settings</button>
      </div>
    </form>
  )
}

export default function ProjectAI({ project }) {
  const [params, setParams] = useSearchParams()
  const section = SECTIONS.some((s) => s.id === params.get('section')) ? params.get('section') : 'orchestrator'
  const [state, setState] = useState(null)
  const [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    let cancelled = false
    api(`/projects/${project.id}/ai`)
      .then((s) => { if (!cancelled) { setState(s); setError('') } })
      .catch((err) => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [project.id, version])

  // Poll quickly while an agent is working, slowly otherwise.
  useEffect(() => {
    if (!state) return undefined
    const timer = setTimeout(refresh, state.busy ? 2000 : 15000)
    return () => clearTimeout(timer)
  }, [state, refresh])

  if (error) return <div className="form-alert">{error}</div>
  if (!state) return <div className="panel-state"><span className="spinner" /> Loading the Orchestrator…</div>

  return (
    <div className="ai-page">
      <div className="segmented ai-sections" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={section === s.id} className={section === s.id ? 'active' : ''}
            onClick={() => setParams((p) => { if (s.id === 'orchestrator') p.delete('section'); else p.set('section', s.id); return p })}>
            {s.label}
            {s.id === 'orchestrator' && state.pending.length > 0 && <span className="badge">{state.pending.length}</span>}
          </button>
        ))}
      </div>
      {section === 'orchestrator' && <Overview state={state} project={project} onChange={refresh} />}
      {section === 'memory' && <MemoryView state={state} />}
      {section === 'audit' && <AuditView projectId={project.id} />}
      {section === 'settings' && <SettingsView state={state} projectId={project.id} onSaved={refresh} />}
    </div>
  )
}

import { env } from '../config/env.js'
import { escape, sendEmail } from '../utils/mailer.js'

const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not set')
const hoursLabel = (h) => (h >= 6 ? `${Math.round((h / 6) * 10) / 10} days (${h} h)` : `${h} h`)

/**
 * "New Task Assigned" email with everything the assignee needs to start work.
 * @param ctx { project, member, task, epic, story, subtasks, dependencies, requirements }
 */
export async function sendTaskAssignedEmail({ project, member, task, epic, story, subtasks, dependencies, requirements }) {
  const url = `${env.clientUrl}/projects/${project._id}/board?task=${encodeURIComponent(task.key)}`
  const subject = `New Task Assigned: ${task.title}`
  const firstName = member.name.split(' ')[0]

  const rows = [
    ['Project', project.name],
    ['Epic', epic ? `${epic.key} · ${epic.title}` : '—'],
    ['Story', story ? `${story.key} · ${story.title}` : '—'],
    ['Task', `${task.key} · ${task.title}`],
    ['Priority', task.priority],
    ['Deadline', fmt(task.dueDate)],
    ['Estimated effort', hoursLabel(task.estimateHours)],
    ['Dependencies', dependencies.length ? dependencies.map((d) => `${d.key} ${d.title}`).join(', ') : 'None'],
  ]
  const list = (items) => items.map((x) => `<li style="margin:0 0 6px">${escape(x)}</li>`).join('')
  const section = (title, body) => `<p style="margin:20px 0 6px;color:#9c7328;font-size:11px;letter-spacing:1.5px;font-weight:700">${title}</p>${body}`

  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ed;font-family:'Segoe UI',Arial,sans-serif;color:#344047">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fbfaf7;border:1px solid #d7d6cf">
    <tr><td style="background:#162b35;padding:20px 28px;color:#e3b85e;font-weight:700;letter-spacing:3px;font-size:13px">ORCHESTRA</td></tr>
    <tr><td style="padding:28px">
      <p style="margin:0 0 6px;font-size:15px">Hello ${escape(firstName)},</p>
      <p style="margin:0 0 18px;font-size:15px">A new task has been assigned to you.</p>
      <h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:24px;color:#1c2430">${escape(task.title)}</h1>
      <table cellpadding="0" cellspacing="0" width="100%" style="font-size:14px;border-top:1px solid #e6e4dd">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px 12px 8px 0;color:#6d7776;width:150px;border-bottom:1px solid #e6e4dd">${k}</td><td style="padding:8px 0;border-bottom:1px solid #e6e4dd">${escape(v)}</td></tr>`).join('')}
      </table>
      ${task.description ? section('DESCRIPTION', `<p style="margin:0;font-size:14px;line-height:1.6">${escape(task.description)}</p>`) : ''}
      ${subtasks.length ? section('SUBTASKS', `<ol style="margin:0;padding-left:20px;font-size:14px">${list(subtasks.map((s) => s.title))}</ol>`) : ''}
      ${task.acceptanceCriteria.length ? section('ACCEPTANCE CRITERIA', `<ul style="margin:0;padding-left:20px;font-size:14px">${list(task.acceptanceCriteria.map((c) => c.text))}</ul>`) : ''}
      ${requirements.length ? section('RELEVANT BRD REQUIREMENTS', `<ul style="margin:0;padding-left:20px;font-size:14px">${list(requirements.map((r) => `${r.id}: ${r.text}`))}</ul>`) : ''}
      <p style="margin:24px 0 20px;font-size:14px">Please complete the task before the deadline.</p>
      <a href="${url}" style="display:inline-block;background:#e3b85e;color:#162b35;text-decoration:none;font-weight:700;padding:13px 24px;font-size:14px">Open task</a>
    </td></tr>
  </table></td></tr></table></body></html>`

  const text = [
    `Hello ${firstName},`, '', 'A new task has been assigned to you.', '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    task.description && `\nDescription:\n${task.description}`,
    subtasks.length && `\nSubtasks:\n${subtasks.map((s, i) => `${i + 1}. ${s.title}`).join('\n')}`,
    task.acceptanceCriteria.length && `\nAcceptance Criteria:\n${task.acceptanceCriteria.map((c) => `- ${c.text}`).join('\n')}`,
    requirements.length && `\nRelevant BRD requirements:\n${requirements.map((r) => `- ${r.id}: ${r.text}`).join('\n')}`,
    '\nPlease complete the task before the deadline.', `\nOpen Task:\n${url}`,
  ].filter(Boolean).join('\n')

  return sendEmail({ to: member.email, subject, html, text })
}

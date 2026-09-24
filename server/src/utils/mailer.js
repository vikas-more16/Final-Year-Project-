import nodemailer from 'nodemailer'
import { env } from '../config/env.js'

const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: { user: env.smtp.user, pass: env.smtp.pass },
    })
  : null

export const emailEnabled = Boolean(transport)

if (!emailEnabled) {
  console.warn('SMTP is not configured: invitation links will be logged instead of emailed.')
}

export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function inviteHtml({ memberName, inviterName, organization, role, projects, url, expiresDays }) {
  const projectLine = projects.length
    ? `<p style="margin:0 0 24px;color:#6d7776;font-size:14px">Projects: <b style="color:#344047">${projects.map(escape).join(', ')}</b></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#f4f2ed;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fbfaf7;border:1px solid #d7d6cf">
      <tr><td style="background:#162b35;padding:22px 32px;color:#e3b85e;font-weight:700;letter-spacing:3px;font-size:13px">ORCHESTRA</td></tr>
      <tr><td style="padding:32px">
        <p style="margin:0 0 8px;color:#9c7328;font-size:11px;letter-spacing:2px;font-weight:700">TEAM INVITATION</p>
        <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:400;font-size:26px;color:#1c2430">Hi ${escape(memberName)}, you’re invited to join ${escape(organization)}</h1>
        <p style="margin:0 0 12px;color:#6d7776;font-size:14px;line-height:1.6">${escape(inviterName)} has invited you to join their team on Orchestra as <b style="color:#344047">${escape(role)}</b>.</p>
        ${projectLine}
        <a href="${url}" style="display:inline-block;background:#e3b85e;color:#162b35;text-decoration:none;font-weight:700;padding:14px 26px;font-size:14px">View invitation</a>
        <p style="margin:24px 0 0;color:#a0a6a1;font-size:12px;line-height:1.6">This invitation expires in ${expiresDays} days. If you weren’t expecting it, you can ignore this email.<br>Or paste this link into your browser: ${url}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`
}

/** Sends the invitation; returns true when an email was actually delivered to the SMTP server. */
export async function sendInviteEmail({ to, ...details }) {
  const subject = `${details.inviterName} invited you to join ${details.organization} on Orchestra`
  if (!transport) {
    console.log(`\n[invite] To: ${to}\n[invite] ${subject}\n[invite] Link: ${details.url}\n`)
    return false
  }
  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject,
    html: inviteHtml(details),
    text: `${subject}.\nRole: ${details.role}\nAccept or decline: ${details.url}\nThis link expires in ${details.expiresDays} days.`,
  })
  return true
}

/** Generic send used by agent notifications. Returns true when the SMTP server accepted the message. */
export async function sendEmail({ to, subject, html, text }) {
  if (!transport) {
    console.log(`\n[email] To: ${to}\n[email] ${subject}\n${text}\n`)
    return false
  }
  await transport.sendMail({ from: env.smtp.from, to, subject, html, text })
  return true
}

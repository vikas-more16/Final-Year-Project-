import mongoose from 'mongoose'
import { env } from '../config/env.js'
import { INVITE_TTL_DAYS, MEMBER_ROLES } from '../config/constants.js'
import { Project } from '../models/Project.js'
import { TeamMember } from '../models/TeamMember.js'
import { HttpError } from '../utils/HttpError.js'
import { emailEnabled, sendInviteEmail } from '../utils/mailer.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Keeps only project ids that belong to this manager. */
async function ownedProjectIds(ownerId, ids) {
  if (!Array.isArray(ids)) return []
  const valid = ids.filter((id) => mongoose.isValidObjectId(id))
  const projects = await Project.find({ owner: ownerId, _id: { $in: valid } }).select('_id')
  return projects.map((p) => p._id)
}

async function findMember(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Team member not found')
  const member = await TeamMember.findOne({ _id: req.params.id, owner: req.user._id })
  if (!member) throw new HttpError(404, 'Team member not found')
  return member
}

/** Emails a fresh invite. When SMTP is not configured, the link is returned so the manager can share it. */
async function deliverInvite(member, manager) {
  const token = member.issueInvite()
  await member.save()
  await member.populate('projects')

  const url = `${env.clientUrl}/invite/${token}`
  let emailed = false
  try {
    emailed = await sendInviteEmail({
      to: member.email,
      memberName: member.name,
      inviterName: manager.name,
      organization: manager.organization || `${manager.name}’s team`,
      role: member.role,
      projects: member.projects.map((p) => p.name),
      url,
      expiresDays: INVITE_TTL_DAYS,
    })
  } catch (err) {
    console.error('Failed to send invite email:', err.message)
  }
  return { member: member.toPublic(), emailed, ...(!emailed && !env.isProduction && { inviteUrl: url }) }
}

export async function listMembers(req, res) {
  const members = await TeamMember.find({ owner: req.user._id }).populate('projects').sort({ createdAt: -1 })
  res.json({ members: members.map((m) => m.toPublic()), roles: MEMBER_ROLES, emailEnabled })
}

export async function inviteMember(req, res) {
  const name = String(req.body.name ?? '').trim()
  const email = String(req.body.email ?? '').trim().toLowerCase()
  const { role } = req.body

  const fields = {}
  if (name.length < 2 || name.length > 80) fields.name = 'Enter the member’s full name'
  if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address'
  else if (email === req.user.email) fields.email = 'You are already the owner of this workspace'
  if (!MEMBER_ROLES.includes(role)) fields.role = 'Choose a role'
  if (Object.keys(fields).length) throw new HttpError(422, 'Please fix the highlighted fields', fields)

  const existing = await TeamMember.findOne({ owner: req.user._id, email })
  if (existing) {
    const message = existing.displayStatus === 'active'
      ? 'This person is already an active member of your team'
      : 'This person has already been invited. Use “Resend invite” instead.'
    throw new HttpError(409, message, { email: message })
  }

  const member = new TeamMember({
    owner: req.user._id,
    name,
    email,
    role,
    projects: await ownedProjectIds(req.user._id, req.body.projectIds),
  })
  res.status(201).json(await deliverInvite(member, req.user))
}

export async function updateMember(req, res) {
  const member = await findMember(req)
  const { name, role, projectIds } = req.body

  if (name !== undefined) {
    const trimmed = String(name).trim()
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new HttpError(422, 'Please fix the highlighted fields', { name: 'Enter the member’s full name' })
    }
    member.name = trimmed
  }
  if (role !== undefined) {
    if (!MEMBER_ROLES.includes(role)) throw new HttpError(422, 'Please fix the highlighted fields', { role: 'Choose a role' })
    member.role = role
  }
  if (projectIds !== undefined) member.projects = await ownedProjectIds(req.user._id, projectIds)

  await member.save()
  await member.populate('projects')
  res.json({ member: member.toPublic() })
}

export async function resendInvite(req, res) {
  const member = await findMember(req)
  if (member.status === 'active') throw new HttpError(400, 'This member has already accepted the invitation')
  res.json(await deliverInvite(member, req.user))
}

export async function removeMember(req, res) {
  const member = await findMember(req)
  await member.deleteOne()
  res.json({ message: member.status === 'active' ? 'Member removed' : 'Invitation cancelled' })
}

import { TeamMember, hashInviteToken } from '../models/TeamMember.js'
import { HttpError } from '../utils/HttpError.js'
import { memberChanged } from '../ai/orchestrator/index.js'

async function findInvite(token) {
  if (typeof token !== 'string' || token.length < 20) throw new HttpError(404, 'This invitation link is invalid')
  const member = await TeamMember.findOne({ inviteTokenHash: hashInviteToken(token) })
    .populate('projects')
    .populate('owner', 'name organization')
  if (!member || !member.owner) throw new HttpError(404, 'This invitation link is invalid or has been cancelled')
  return member
}

function describe(member) {
  return {
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.displayStatus,
    projects: member.projects.map((p) => ({ name: p.name, key: p.key })),
    inviterName: member.owner.name,
    organization: member.owner.organization || `${member.owner.name}’s team`,
    expiresAt: member.inviteExpiresAt,
  }
}

export async function getInvite(req, res) {
  const member = await findInvite(req.params.token)
  res.json({ invite: describe(member) })
}

async function respond(req, res, status) {
  const member = await findInvite(req.params.token)
  const current = member.displayStatus
  if (current === 'expired') throw new HttpError(410, 'This invitation has expired. Ask the project manager to resend it.')
  if (current !== 'pending') throw new HttpError(409, `This invitation was already ${current === 'active' ? 'accepted' : 'declined'}`)

  member.status = status
  member.respondedAt = new Date()
  await member.save()
  // A newly active member may fill vacant tasks.
  if (status === 'active') memberChanged({ name: member.name, projects: member.projects.map((p) => p._id ?? p) })
  res.json({ invite: describe(member) })
}

export const acceptInvite = (req, res) => respond(req, res, 'active')
export const declineInvite = (req, res) => respond(req, res, 'declined')

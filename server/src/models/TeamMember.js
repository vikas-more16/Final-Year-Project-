import crypto from 'node:crypto'
import mongoose from 'mongoose'
import { INVITE_TTL_DAYS, MEMBER_ROLES } from '../config/constants.js'

const teamMemberSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, required: true, enum: MEMBER_ROLES },
    projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
    // Team Directory data used by the assignment engine.
    skills: { type: [{ type: String, trim: true, lowercase: true, maxlength: 40 }], default: [] },
    capacityHoursPerWeek: { type: Number, min: 1, max: 60, default: 30 },
    availability: { type: String, enum: ['available', 'unavailable'], default: 'available' },
    status: { type: String, enum: ['pending', 'active', 'declined'], default: 'pending' },
    // Only a hash of the invite token is stored, so a leaked database cannot be used to accept invites.
    inviteTokenHash: { type: String, index: true, select: false },
    inviteExpiresAt: { type: Date },
    invitedAt: { type: Date },
    respondedAt: { type: Date },
  },
  { timestamps: true },
)

teamMemberSchema.index({ owner: 1, email: 1 }, { unique: true })

export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

/** Issues a fresh invite token (invalidating any previous one) and returns the raw token. */
teamMemberSchema.methods.issueInvite = function issueInvite() {
  const token = crypto.randomBytes(32).toString('base64url')
  this.inviteTokenHash = hashInviteToken(token)
  this.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  this.invitedAt = new Date()
  this.status = 'pending'
  this.respondedAt = undefined
  return token
}

teamMemberSchema.virtual('displayStatus').get(function displayStatus() {
  if (this.status === 'pending' && this.inviteExpiresAt < new Date()) return 'expired'
  return this.status
})

teamMemberSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    skills: this.skills,
    capacityHoursPerWeek: this.capacityHoursPerWeek,
    availability: this.availability,
    status: this.displayStatus,
    projects: this.projects.map((p) => (p?.toPublic ? p.toPublic() : { id: p })),
    invitedAt: this.invitedAt,
    inviteExpiresAt: this.status === 'pending' ? this.inviteExpiresAt : undefined,
    respondedAt: this.respondedAt,
    createdAt: this.createdAt,
  }
}

export const TeamMember = mongoose.model('TeamMember', teamMemberSchema)

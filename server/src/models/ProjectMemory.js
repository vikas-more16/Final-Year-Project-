import mongoose from 'mongoose'

const { Mixed, ObjectId } = mongoose.Schema.Types

export const REQUIREMENT_TYPES = ['functional', 'non_functional', 'business_rule', 'constraint', 'dependency']

const requirementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true }, // e.g. FR-3, as written in the BRD when it has IDs
    type: { type: String, enum: REQUIREMENT_TYPES, default: 'functional' },
    text: { type: String, required: true },
    area: String, // functional area, used to group requirements into epics
    acceptanceCriteria: { type: [String], default: [] },
    source: { type: String, enum: ['brd', 'user'], default: 'brd' },
  },
  { _id: false },
)

/**
 * The single shared Project Memory every agent reads from and the Orchestrator writes to.
 * Work items, sprints and the team live in their own collections; the snapshot service joins them.
 */
const projectMemorySchema = new mongoose.Schema(
  {
    project: { type: ObjectId, ref: 'Project', required: true, unique: true },
    info: {
      summary: String,
      objectives: { type: [String], default: [] },
      scope: { type: [String], default: [] },
      outOfScope: { type: [String], default: [] },
      constraints: { type: [String], default: [] },
      techStack: { type: [String], default: [] },
      startDate: Date,
      deadline: Date,
    },
    decisions: { type: [{ at: Date, by: String, text: String }], default: [] },
    userContext: {
      prompts: { type: [{ at: Date, text: String, intent: String, response: String }], default: [] },
      instructions: { type: [{ at: Date, text: String }], default: [] },
      clarifications: {
        type: [{ question: String, reason: String, critical: Boolean, answer: String, askedAt: Date, answeredAt: Date }],
        default: [],
      },
    },
    brd: {
      fileId: ObjectId,
      textChars: Number,
      analyzedAt: Date,
      requirements: { type: [requirementSchema], default: [] },
      userRoles: { type: [String], default: [] },
      workflows: { type: [String], default: [] },
    },
    planning: {
      status: { type: String, enum: ['idle', 'running', 'awaiting_clarification', 'planned', 'failed'], default: 'idle' },
      lastPlannedAt: Date,
      sprintLengthDays: { type: Number, default: 14 },
      scheduleRisk: Mixed, // null, or { estimatedCompletion, deadline, differenceDays, reasons[] }
      vacantRoles: { type: [String], default: [] },
    },
    // Per action: 'auto' or 'approval'. Missing keys fall back to DEFAULT_APPROVALS.
    approvals: { type: Mixed, default: () => ({}) },
  },
  { timestamps: true, minimize: false },
)

export const ProjectMemory = mongoose.model('ProjectMemory', projectMemorySchema)

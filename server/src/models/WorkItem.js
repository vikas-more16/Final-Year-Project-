import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

export const WORK_ITEM_TYPES = ['epic', 'story', 'task', 'subtask']
export const WORK_ITEM_STATUSES = ['todo', 'in_progress', 'in_review', 'done']
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

/** Every level of the plan (Epic → Story → Task → Subtask) is a WorkItem, linked by parent/epic. */
const workItemSchema = new mongoose.Schema(
  {
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    type: { type: String, enum: WORK_ITEM_TYPES, required: true },
    number: { type: Number, required: true },
    key: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 4000 },
    objective: { type: String, trim: true, maxlength: 1000 }, // business objective (epics)
    parent: { type: ObjectId, ref: 'WorkItem', index: true },
    epic: { type: ObjectId, ref: 'WorkItem', index: true },
    brdRefs: { type: [String], default: [] },
    priority: { type: String, enum: PRIORITIES, default: 'Medium' },
    estimateHours: { type: Number, min: 0, default: 0 },
    requiredRole: { type: String },
    skills: { type: [String], default: [] },
    acceptanceCriteria: { type: [{ text: String, met: { type: Boolean, default: false } }], default: [] },
    dependsOn: { type: [{ type: ObjectId, ref: 'WorkItem' }], default: [] },
    status: { type: String, enum: WORK_ITEM_STATUSES, default: 'todo' },
    // Computed by the dependency engine: open items this one is waiting for.
    blockedBy: { type: [{ type: ObjectId, ref: 'WorkItem' }], default: [] },
    blockedReason: { type: String },
    assignee: { type: ObjectId, ref: 'TeamMember' },
    assignment: {
      state: { type: String, enum: ['assigned', 'pending', 'not_required'], default: 'pending' },
      reason: String,
      assignedAt: Date,
      notifiedAt: Date, // when the assignment email was attempted
      notification: { type: String, enum: ['sent', 'failed', 'not_configured'] },
    },
    sprint: { type: ObjectId, ref: 'Sprint' },
    plannedStart: Date,
    plannedEnd: Date,
    dueDate: Date,
    startedAt: Date,
    completedAt: Date,
    acceptanceVerifiedAt: Date,
    source: { type: String, enum: ['planning_agent', 'user'], default: 'planning_agent' },
    createdByRun: { type: ObjectId, ref: 'AgentRun' },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)

workItemSchema.index({ project: 1, key: 1 }, { unique: true })
workItemSchema.index({ project: 1, type: 1, status: 1 })

export const WorkItem = mongoose.model('WorkItem', workItemSchema)

import mongoose from 'mongoose'

const { Mixed, ObjectId } = mongoose.Schema.Types

const auditLogSchema = new mongoose.Schema(
  {
    project: { type: ObjectId, ref: 'Project', required: true, index: true },
    at: { type: Date, default: Date.now, index: true },
    agent: { type: String, required: true },
    action: { type: String, required: true },
    inputContext: String,
    decision: String,
    reason: String,
    entityType: String,
    entityId: ObjectId,
    entityKey: String,
    previousState: Mixed,
    newState: Mixed,
    run: { type: ObjectId, ref: 'AgentRun' },
  },
  { versionKey: false },
)

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)

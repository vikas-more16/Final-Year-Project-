import mongoose from 'mongoose'

/** An impactful change proposed by an agent that waits for the manager's approval. */
const pendingActionSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    action: { type: String, required: true },
    title: { type: String, required: true },
    summary: String,
    reason: String,
    payload: mongoose.Schema.Types.Mixed,
    proposedBy: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    decidedAt: Date,
  },
  { timestamps: true },
)

export const PendingAction = mongoose.model('PendingAction', pendingActionSchema)

import mongoose from 'mongoose'

/** One unit of agent work, tracked by the Orchestrator so the UI can show progress and failures. */
const agentRunSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    agent: { type: String, required: true },
    action: { type: String, required: true },
    trigger: { type: String, required: true }, // event that caused the run
    status: {
      type: String,
      enum: ['queued', 'running', 'succeeded', 'failed', 'awaiting_input'],
      default: 'queued',
    },
    steps: { type: [{ at: Date, message: String }], default: [] },
    summary: String,
    error: String,
    llm: { calls: { type: Number, default: 0 }, tokens: { type: Number, default: 0 } },
    startedAt: Date,
    finishedAt: Date,
  },
  { timestamps: true },
)

export const AgentRun = mongoose.model('AgentRun', agentRunSchema)

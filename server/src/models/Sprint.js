import mongoose from 'mongoose'

const sprintSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    number: { type: Number, required: true },
    name: { type: String, required: true },
    goal: { type: String, maxlength: 500 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    capacityHours: { type: Number, default: 0 },
    plannedHours: { type: Number, default: 0 },
    status: { type: String, enum: ['planned', 'active', 'completed'], default: 'planned' },
    epics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WorkItem' }],
    deliverables: { type: [String], default: [] },
  },
  { timestamps: true },
)

sprintSchema.index({ project: 1, number: 1 }, { unique: true })

export const Sprint = mongoose.model('Sprint', sprintSchema)

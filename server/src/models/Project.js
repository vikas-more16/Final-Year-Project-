import mongoose from 'mongoose'
import { PROJECT_MODEL_IDS, PROJECT_TABS } from '../config/constants.js'

const projectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z][A-Z0-9]{1,9}$/ },
    description: { type: String, trim: true, maxlength: 500 },
    // Enforced in the controller so projects created before this field existed stay valid.
    model: { type: String, enum: PROJECT_MODEL_IDS },
    // Counter for work item keys (MBP-1, MBP-2, ...).
    workItemSeq: { type: Number, default: 0 },
    // Ordered list of visible tabs; empty means "never customised", which shows every tab.
    tabs: { type: [{ type: String, enum: PROJECT_TABS }], default: undefined },
    brd: {
      fileId: mongoose.Schema.Types.ObjectId, // GridFS file in the "brd" bucket
      originalName: String,
      mimeType: String,
      size: Number,
      uploadedAt: Date,
    },
  },
  { timestamps: true },
)

projectSchema.index({ owner: 1, key: 1 }, { unique: true })

projectSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    key: this.key,
    description: this.description,
    model: this.model,
    tabs: this.tabs?.length ? this.tabs : PROJECT_TABS,
    brd: this.brd?.fileId
      ? { name: this.brd.originalName, size: this.brd.size, mimeType: this.brd.mimeType, uploadedAt: this.brd.uploadedAt }
      : null,
    createdAt: this.createdAt,
  }
}

export const Project = mongoose.model('Project', projectSchema)

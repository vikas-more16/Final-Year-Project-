import mongoose from 'mongoose'

const projectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, uppercase: true, trim: true, match: /^[A-Z][A-Z0-9]{1,9}$/ },
    description: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true },
)

projectSchema.index({ owner: 1, key: 1 }, { unique: true })

projectSchema.methods.toPublic = function toPublic() {
  return { id: this._id, name: this.name, key: this.key, description: this.description, createdAt: this.createdAt }
}

export const Project = mongoose.model('Project', projectSchema)

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    organization: { type: String, trim: true, maxlength: 100 },
    password: { type: String, select: false },
    googleId: { type: String, unique: true, sparse: true },
    avatar: { type: String },
    role: { type: String, enum: ['manager', 'admin'], default: 'manager' },
    providers: { type: [String], enum: ['password', 'google'], default: [] },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
)

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password') || !this.password) return
  this.password = await bcrypt.hash(this.password, 12)
})

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return false
  return bcrypt.compare(candidate, this.password)
}

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    organization: this.organization,
    avatar: this.avatar,
    role: this.role,
    providers: this.providers,
    createdAt: this.createdAt,
  }
}

export const User = mongoose.model('User', userSchema)

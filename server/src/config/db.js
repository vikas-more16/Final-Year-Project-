import mongoose from 'mongoose'
import { env } from './env.js'

export async function connectDB() {
  await mongoose.connect(env.mongoUri)
  // Unique indexes (e.g. one Project Memory per project) must exist before any request races to create documents.
  await Promise.all(Object.values(mongoose.models).map((model) => model.createIndexes()))
  console.log(`MongoDB connected: ${mongoose.connection.name}`)
}

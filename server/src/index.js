import { env } from './config/env.js'
import { connectDB } from './config/db.js'
import { app } from './app.js'
import { recoverOnBoot, startTicker } from './ai/orchestrator/index.js'

// A background agent job must never take the API down; log and keep serving.
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err))

try {
  await connectDB()
  await recoverOnBoot()
  startTicker()
  app.listen(env.port, () => console.log(`Orchestra API listening on http://localhost:${env.port}`))
} catch (err) {
  console.error('Failed to start server:', err.message)
  process.exit(1)
}

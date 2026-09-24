import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { env } from './env.js'

// Verifying ID tokens only needs the project ID; no service account required.
const app = initializeApp({ projectId: env.firebaseProjectId })

export const firebaseAuth = getAuth(app)

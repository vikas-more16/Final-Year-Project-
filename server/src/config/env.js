const required = ['MONGO_URI', 'JWT_SECRET', 'FIREBASE_PROJECT_ID']
const missing = required.filter((key) => !process.env[key])
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(', ')}`)
}

export const env = {
  port: Number(process.env.PORT) || 5000,
  isProduction: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGO_URI,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
}

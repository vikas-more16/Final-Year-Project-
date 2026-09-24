import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { env } from './config/env.js'
import authRoutes from './routes/auth.js'
import teamRoutes from './routes/team.js'
import projectRoutes from './routes/projects.js'
import inviteRoutes from './routes/invites.js'
import { errorHandler, notFound } from './middleware/errorHandler.js'

export const app = express()

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: env.clientUrl, credentials: true }))
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRoutes)
app.use('/api/team', teamRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/invites', inviteRoutes)

app.use(notFound)
app.use(errorHandler)

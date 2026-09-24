import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { googleLogin, login, logout, me, register } from '../controllers/authController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again in a few minutes' },
})

router.post('/register', authLimiter, register)
router.post('/login', authLimiter, login)
router.post('/google', authLimiter, googleLogin)
router.post('/logout', logout)
router.get('/me', requireAuth, me)

export default router

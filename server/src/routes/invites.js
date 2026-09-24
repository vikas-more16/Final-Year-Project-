import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { acceptInvite, declineInvite, getInvite } from '../controllers/inviteController.js'

const router = Router()

// Public endpoints: the secret token in the URL is the credential, so throttle guessing.
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }))

router.get('/:token', getInvite)
router.post('/:token/accept', acceptInvite)
router.post('/:token/decline', declineInvite)

export default router

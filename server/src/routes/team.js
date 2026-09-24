import { Router } from 'express'
import { inviteMember, listMembers, removeMember, resendInvite, updateMember } from '../controllers/teamController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', listMembers)
router.post('/', inviteMember)
router.patch('/:id', updateMember)
router.delete('/:id', removeMember)
router.post('/:id/resend', resendInvite)

export default router

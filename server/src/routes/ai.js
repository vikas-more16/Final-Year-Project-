import { Router } from 'express'
import {
  getAiState, listAudit, loadOwnedProject, postApproval, postClarification, sendPrompt, startPlanning, updateSettings,
} from '../controllers/aiController.js'
import { getWorkItem, listWorkItems, patchStatus } from '../controllers/workItemController.js'
import { requireAuth } from '../middleware/auth.js'

// Mounted at /api/projects/:id
const router = Router({ mergeParams: true })
router.use(requireAuth, loadOwnedProject)

router.get('/ai', getAiState)
router.post('/ai/plan', startPlanning)
router.post('/ai/prompt', sendPrompt)
router.post('/ai/clarifications/:index', postClarification)
router.post('/ai/approvals/:actionId', postApproval)
router.put('/ai/settings', updateSettings)
router.get('/ai/audit', listAudit)

router.get('/work-items', listWorkItems)
router.get('/work-items/:key', getWorkItem)
router.patch('/work-items/:key/status', patchStatus)

export default router

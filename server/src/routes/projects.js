import { Router } from 'express'
import { createProject, deleteProject, listProjects } from '../controllers/projectController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.use(requireAuth)

router.get('/', listProjects)
router.post('/', createProject)
router.delete('/:id', deleteProject)

export default router

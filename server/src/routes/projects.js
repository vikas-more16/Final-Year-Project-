import { Router } from 'express'
import { createProject, deleteProject, downloadBrd, listProjects, replaceBrd } from '../controllers/projectController.js'
import { requireAuth } from '../middleware/auth.js'
import { acceptBrd } from '../utils/brdStorage.js'

const router = Router()
router.use(requireAuth)

router.get('/', listProjects)
router.post('/', acceptBrd, createProject)
router.delete('/:id', deleteProject)
router.get('/:id/brd', downloadBrd)
router.put('/:id/brd', acceptBrd, replaceBrd)

export default router

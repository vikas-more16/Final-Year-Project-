import { Router } from 'express'
import {
  createProject, deleteProject, downloadBrd, getProject, listProjects, replaceBrd, updateTabs,
} from '../controllers/projectController.js'
import { requireAuth } from '../middleware/auth.js'
import { acceptBrd } from '../utils/brdStorage.js'

const router = Router()
router.use(requireAuth)

router.get('/', listProjects)
router.post('/', acceptBrd, createProject)
router.get('/:id', getProject)
router.delete('/:id', deleteProject)
router.put('/:id/tabs', updateTabs)
router.get('/:id/brd', downloadBrd)
router.put('/:id/brd', acceptBrd, replaceBrd)

export default router

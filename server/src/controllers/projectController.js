import mongoose from 'mongoose'
import { PROJECT_MODELS, PROJECT_MODEL_IDS, PROJECT_TABS } from '../config/constants.js'
import { Project } from '../models/Project.js'
import { TeamMember } from '../models/TeamMember.js'
import { HttpError } from '../utils/HttpError.js'
import { checkBrd, deleteBrd, openBrd, saveBrd } from '../utils/brdStorage.js'

async function findProject(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Project not found')
  const project = await Project.findOne({ _id: req.params.id, owner: req.user._id })
  if (!project) throw new HttpError(404, 'Project not found')
  return project
}

export async function listProjects(req, res) {
  const [projects, counts] = await Promise.all([
    Project.find({ owner: req.user._id }).sort({ createdAt: -1 }),
    TeamMember.aggregate([
      { $match: { owner: req.user._id } },
      { $unwind: '$projects' },
      { $group: { _id: '$projects', count: { $sum: 1 } } },
    ]),
  ])
  const memberCount = Object.fromEntries(counts.map((c) => [c._id.toString(), c.count]))
  res.json({
    projects: projects.map((p) => ({ ...p.toPublic(), memberCount: memberCount[p._id.toString()] ?? 0 })),
    models: PROJECT_MODELS,
  })
}

export async function createProject(req, res) {
  const name = String(req.body.name ?? '').trim()
  const key = String(req.body.key ?? '').trim().toUpperCase()
  const description = String(req.body.description ?? '').trim()
  const model = String(req.body.model ?? '')

  const fields = {}
  if (name.length < 2 || name.length > 80) fields.name = 'Project name must be 2–80 characters'
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) fields.key = 'Key must be 2–10 letters or digits, starting with a letter'
  if (description.length > 500) fields.description = 'Description must be under 500 characters'
  if (!PROJECT_MODEL_IDS.includes(model)) fields.model = 'Choose a development model'
  const brdError = checkBrd(req.file)
  if (brdError) fields.brd = brdError
  if (Object.keys(fields).length) throw new HttpError(422, 'Please fix the highlighted fields', fields)

  if (await Project.exists({ owner: req.user._id, key })) {
    throw new HttpError(409, 'You already have a project with this key', { key: 'This key is already in use' })
  }

  const brd = await saveBrd(req.file, { ownerId: req.user._id, projectKey: key })
  try {
    const project = await Project.create({ owner: req.user._id, name, key, description, model, brd })
    res.status(201).json({ project: { ...project.toPublic(), memberCount: 0 } })
  } catch (err) {
    await deleteBrd(brd.fileId)
    throw err
  }
}

export async function getProject(req, res) {
  const project = await findProject(req)
  const members = await TeamMember.find({ owner: req.user._id, projects: project._id }).sort({ status: 1, name: 1 })
  res.json({
    project: { ...project.toPublic(), memberCount: members.length },
    members: members.map((m) => ({ id: m._id, name: m.name, email: m.email, role: m.role, status: m.displayStatus })),
    models: PROJECT_MODELS,
  })
}

export async function updateTabs(req, res) {
  const project = await findProject(req)
  const { tabs } = req.body
  if (!Array.isArray(tabs) || tabs.length === 0) throw new HttpError(422, 'A project needs at least one tab')
  if (tabs.some((t) => !PROJECT_TABS.includes(t)) || new Set(tabs).size !== tabs.length) {
    throw new HttpError(422, 'Invalid tab list')
  }
  project.tabs = tabs
  await project.save()
  res.json({ project: project.toPublic() })
}

export async function replaceBrd(req, res) {
  const project = await findProject(req)
  const brdError = checkBrd(req.file)
  if (brdError) throw new HttpError(422, brdError, { brd: brdError })

  const previous = project.brd?.fileId
  project.brd = await saveBrd(req.file, { ownerId: req.user._id, projectKey: project.key })
  await project.save()
  await deleteBrd(previous)
  res.json({ project: project.toPublic() })
}

export async function downloadBrd(req, res) {
  const project = await findProject(req)
  if (!project.brd?.fileId) throw new HttpError(404, 'This project has no BRD yet')

  res.type(project.brd.mimeType)
  res.set('Content-Length', String(project.brd.size))
  res.attachment(project.brd.originalName)
  const stream = openBrd(project.brd.fileId)
  stream.on('error', (err) => {
    console.error('Failed to stream BRD', project.brd.fileId, err.message)
    if (!res.headersSent) res.status(404).json({ message: 'The BRD file could not be found' })
    else res.destroy(err)
  })
  stream.pipe(res)
}

export async function deleteProject(req, res) {
  const project = await findProject(req)
  await project.deleteOne()
  await TeamMember.updateMany({ owner: req.user._id }, { $pull: { projects: project._id } })
  await deleteBrd(project.brd?.fileId)
  res.json({ message: 'Project deleted' })
}

import mongoose from 'mongoose'
import { Project } from '../models/Project.js'
import { TeamMember } from '../models/TeamMember.js'
import { HttpError } from '../utils/HttpError.js'

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
  })
}

export async function createProject(req, res) {
  const name = String(req.body.name ?? '').trim()
  const key = String(req.body.key ?? '').trim().toUpperCase()
  const description = String(req.body.description ?? '').trim()

  const fields = {}
  if (name.length < 2 || name.length > 80) fields.name = 'Project name must be 2–80 characters'
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(key)) fields.key = 'Key must be 2–10 letters or digits, starting with a letter'
  if (description.length > 500) fields.description = 'Description must be under 500 characters'
  if (Object.keys(fields).length) throw new HttpError(422, 'Please fix the highlighted fields', fields)

  if (await Project.exists({ owner: req.user._id, key })) {
    throw new HttpError(409, 'You already have a project with this key', { key: 'This key is already in use' })
  }
  const project = await Project.create({ owner: req.user._id, name, key, description })
  res.status(201).json({ project: { ...project.toPublic(), memberCount: 0 } })
}

export async function deleteProject(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Project not found')
  const project = await Project.findOneAndDelete({ _id: req.params.id, owner: req.user._id })
  if (!project) throw new HttpError(404, 'Project not found')
  await TeamMember.updateMany({ owner: req.user._id }, { $pull: { projects: project._id } })
  res.json({ message: 'Project deleted' })
}

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeBlocking, rollupStatuses } from '../src/ai/engine/dependencies.js'
import { schedule } from '../src/ai/engine/scheduler.js'

let seq = 0
const item = (type, extra = {}) => ({
  _id: `id${++seq}`, key: `T-${seq}`, type, status: 'todo', dependsOn: [], blockedBy: [], priority: 'Medium',
  estimateHours: 12, order: seq, skills: [], ...extra,
})

function project() {
  seq = 0
  const epicA = item('epic', { title: 'Auth' })
  const epicB = item('epic', { title: 'Payments', dependsOn: [] })
  const story = item('story', { parent: epicA._id, epic: epicA._id })
  const api = item('task', { parent: story._id, epic: epicA._id, requiredRole: 'Backend Developer', priority: 'High', skills: ['node'] })
  const ui = item('task', { parent: story._id, epic: epicA._id, requiredRole: 'Frontend Developer', dependsOn: [api._id] })
  const qa = item('task', { parent: story._id, epic: epicA._id, requiredRole: 'QA Engineer', dependsOn: [ui._id] })
  const storyB = item('story', { parent: epicB._id, epic: epicB._id })
  const pay = item('task', { parent: storyB._id, epic: epicB._id, requiredRole: 'Backend Developer' })
  return { epicA, epicB, story, api, ui, qa, storyB, pay, all: [epicA, epicB, story, api, ui, qa, storyB, pay] }
}

const team = [
  { _id: 'm1', name: 'Asha', role: 'Backend Developer', skills: ['node'], capacityHoursPerWeek: 30 },
  { _id: 'm2', name: 'Ravi', role: 'Backend Developer', skills: [], capacityHoursPerWeek: 30 },
  { _id: 'm3', name: 'Yash', role: 'Full Stack Developer', skills: [], capacityHoursPerWeek: 30 },
]
const monday = new Date('2026-10-05')

test('respects dependencies: a task starts no earlier than its prerequisite ends', () => {
  const p = project()
  const out = schedule(p.all, team, { startDate: monday, today: monday })
  const r = Object.fromEntries(out.tasks.map((t) => [t._id, t]))
  assert.ok(r[p.ui._id].plannedStart >= r[p.api._id].plannedEnd)
})

test('prefers the exact role and matching skills, falls back to compatible roles', () => {
  const p = project()
  const out = schedule(p.all, team, { startDate: monday, today: monday })
  const r = Object.fromEntries(out.tasks.map((t) => [t._id, t]))
  assert.equal(r[p.api._id].assignee, 'm1') // backend + node skill
  assert.equal(r[p.ui._id].assignee, 'm3') // no frontend dev -> full stack fallback
  assert.equal(r[p.pay._id].assignee, 'm2') // parallel backend work goes to the free backend dev
})

test('never fabricates an assignment when no one has the role', () => {
  const p = project()
  const out = schedule(p.all, team, { startDate: monday, today: monday })
  const qa = out.tasks.find((t) => t._id === p.qa._id)
  assert.equal(qa.assignmentState, 'pending')
  assert.equal(qa.assignee, null)
  assert.match(qa.assignmentReason, /QA Engineer/)
  assert.deepEqual(out.vacantRoles, ['QA Engineer'])
  assert.ok(qa.plannedEnd, 'vacant work still gets estimated dates')
})

test('one person never works on two tasks at the same time (capacity)', () => {
  seq = 0
  const epic = item('epic')
  const story = item('story', { parent: epic._id, epic: epic._id })
  const tasks = [1, 2, 3].map(() => item('task', { parent: story._id, epic: epic._id, requiredRole: 'QA Engineer', estimateHours: 30 }))
  const out = schedule([epic, story, ...tasks], [{ _id: 'q', role: 'QA Engineer', capacityHoursPerWeek: 30 }], { startDate: monday, today: monday })
  const sorted = out.tasks.sort((a, b) => a.plannedStart - b.plannedStart)
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].plannedStart > sorted[i - 1].plannedEnd)
  assert.equal(out.tasks.at(-1).plannedEnd.toDateString(), new Date(2026, 9, 23).toDateString()) // 90 h at 6 h/day = 15 working days
})

test('epic dependency waits for the prerequisite epic to be built, not for its testing', () => {
  const p = project()
  p.epicB.dependsOn = [p.epicA._id]
  const blocked = computeBlocking(p.all).find((c) => c.item === p.pay)
  assert.deepEqual(new Set(blocked.blockedBy), new Set([p.api._id, p.ui._id]))
})

test('blocking clears when prerequisites are done, and statuses roll up', () => {
  const p = project()
  p.ui.blockedBy = [p.api._id]
  p.api.status = 'done'
  const change = computeBlocking(p.all).find((c) => c.item === p.ui)
  assert.deepEqual(change.blockedBy, [])
  assert.equal(rollupStatuses(p.all).find((c) => c.item === p.story).status, 'in_progress')
})

test('flags schedule risk with a reason instead of an impossible deadline', () => {
  const p = project()
  const out = schedule(p.all, team, { startDate: monday, today: monday, deadline: new Date('2026-10-06') })
  assert.ok(out.risk.differenceDays > 0)
  assert.ok(out.risk.reasons.some((r) => /QA Engineer/.test(r)))
})

test('sprints cover the plan and never plan more assigned hours than capacity', () => {
  const p = project()
  const out = schedule(p.all, team, { startDate: monday, today: monday, sprintLengthDays: 7 })
  assert.ok(out.sprints.length >= 1)
  for (const s of out.sprints) assert.ok(s.plannedHours <= s.capacityHours, `sprint ${s.number} over capacity`)
})

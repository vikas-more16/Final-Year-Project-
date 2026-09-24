export const MEMBER_ROLES = [
  'Team Lead',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'UI/UX Designer',
  'QA Engineer',
  'DevOps Engineer',
  'Business Analyst',
  'Product Owner',
]

export const INVITE_TTL_DAYS = 7

export const PROJECT_MODELS = [
  { id: 'Waterfall', description: 'Sequential phases: requirements, design, build, test, deploy.' },
  { id: 'Agile', description: 'Iterative delivery with continuous feedback and change.' },
  { id: 'Scrum', description: 'Time-boxed sprints with backlog, standups and reviews.' },
  { id: 'Kanban', description: 'Continuous flow of work with WIP limits on a board.' },
  { id: 'Spiral', description: 'Risk-driven iterations of planning, analysis and building.' },
  { id: 'V-Model', description: 'Each development phase paired with a matching test phase.' },
  { id: 'Prototype', description: 'Build and refine prototypes with users before the final product.' },
  { id: 'Incremental', description: 'Deliver the product in working, functional increments.' },
  { id: 'RAD', description: 'Rapid Application Development with fast prototyping and reuse.' },
  { id: 'DevOps', description: 'Continuous integration, delivery and operations feedback.' },
]
export const PROJECT_MODEL_IDS = PROJECT_MODELS.map((m) => m.id)

export const BRD_MAX_BYTES = 10 * 1024 * 1024
export const BRD_TYPES = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
}

// Views a project can show as tabs (labels and icons live in the client). New projects start with all of them.
export const PROJECT_TABS = [
  'summary', 'backlog', 'board', 'development', 'timeline', 'docs',
  'forms', 'calendar', 'code', 'deployments', 'reports', 'releases',
]

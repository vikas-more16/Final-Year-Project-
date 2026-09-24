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
  'summary', 'ai', 'backlog', 'board', 'development', 'timeline', 'docs',
  'forms', 'calendar', 'code', 'deployments', 'reports', 'releases',
]

// When nobody has the exact role, which other roles may take the work (in order of preference).
export const ROLE_FALLBACKS = {
  'Frontend Developer': ['Full Stack Developer'],
  'Backend Developer': ['Full Stack Developer'],
  'Full Stack Developer': ['Backend Developer', 'Frontend Developer'],
  'Business Analyst': ['Product Owner'],
  'Product Owner': ['Business Analyst', 'Team Lead'],
  'Team Lead': [],
  'UI/UX Designer': [],
  'QA Engineer': [],
  'DevOps Engineer': [],
}

// Actions an agent may take and whether they run automatically or wait for the manager.
export const AI_ACTIONS = {
  create_work_items: { label: 'Create epics, stories, tasks and subtasks', default: 'auto' },
  assign_task: { label: 'Assign unassigned tasks', default: 'auto' },
  send_notifications: { label: 'Email assignees about new tasks', default: 'auto' },
  update_status: { label: 'Update statuses and unblock dependent work', default: 'auto' },
  reassign_critical_task: { label: 'Reassign Critical or High priority tasks', default: 'approval' },
  change_deadline: { label: 'Change the project deadline', default: 'approval' },
  change_scope: { label: 'Re-plan after a BRD change or new requirement', default: 'approval' },
  remove_work_item: { label: 'Remove backlog items', default: 'approval' },
}

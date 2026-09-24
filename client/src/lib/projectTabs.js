import {
  CalendarDays, ChartGantt, ChartLine, ClipboardList, Code, CodeXml, Columns3, FileText, Globe, PackageOpen, Rocket, Rows3,
} from 'lucide-react'

/** Every view a project can show. Keep the ids in sync with PROJECT_TABS on the server. */
export const PROJECT_TABS = [
  { id: 'summary', label: 'Summary', Icon: Globe, description: 'Project overview, BRD, team and agent status.' },
  { id: 'backlog', label: 'Backlog', Icon: Rows3, description: 'Plan sprints and prioritise upcoming work.' },
  { id: 'board', label: 'Board', Icon: Columns3, description: 'Track tasks across To Do, In Progress, In Review and Done.' },
  { id: 'development', label: 'Development', Icon: CodeXml, description: 'Branches, commits and pull requests linked to tasks.' },
  { id: 'timeline', label: 'Timeline', Icon: ChartGantt, description: 'Epics and milestones on a Gantt-style roadmap.' },
  { id: 'docs', label: 'Docs', Icon: FileText, description: 'Specs, meeting notes and agent-written documents.' },
  { id: 'forms', label: 'Forms', Icon: ClipboardList, description: 'Collect requests from stakeholders as tasks.' },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays, description: 'Due dates, sprints and releases by date.' },
  { id: 'code', label: 'Code', Icon: Code, description: 'Repositories connected to this project.' },
  { id: 'deployments', label: 'Deployments', Icon: Rocket, description: 'Where and when each change was deployed.' },
  { id: 'reports', label: 'Reports', Icon: ChartLine, description: 'Burndown, velocity and agent-generated status reports.' },
  { id: 'releases', label: 'Releases', Icon: PackageOpen, description: 'Versions, release notes and what shipped.' },
]

export const TAB_BY_ID = Object.fromEntries(PROJECT_TABS.map((t) => [t.id, t]))

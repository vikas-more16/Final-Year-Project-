import { Navigate, useOutletContext, useParams } from 'react-router-dom'
import { TAB_BY_ID } from '../../lib/projectTabs'
import ProjectAI from './ProjectAI'
import ProjectBacklog from './ProjectBacklog'
import ProjectBoard from './ProjectBoard'
import ProjectSummary from './ProjectSummary'

const VIEWS = { summary: ProjectSummary, ai: ProjectAI, board: ProjectBoard, backlog: ProjectBacklog }

function TabPlaceholder({ tab }) {
  return (
    <div className="tab-placeholder">
      <span className="tab-placeholder-icon"><tab.Icon size={28} strokeWidth={1.6} /></span>
      <h2>{tab.label}</h2>
      <p>{tab.description}</p>
      <span className="soon-pill">Coming soon</span>
    </div>
  )
}

export default function ProjectTab() {
  const { tabId } = useParams()
  const context = useOutletContext()

  // A removed or unknown tab falls back to the first visible one.
  if (!context.project.tabs.includes(tabId)) return <Navigate to={`../${context.project.tabs[0]}`} replace />

  const View = VIEWS[tabId]
  return View ? <View {...context} /> : <TabPlaceholder tab={TAB_BY_ID[tabId]} />
}

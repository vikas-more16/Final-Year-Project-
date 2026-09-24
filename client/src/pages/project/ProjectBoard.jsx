import { Search } from 'lucide-react'
import { initials } from '../../lib/format'

const COLUMNS = ['To Do', 'In Progress', 'In Review', 'Done']

export default function ProjectBoard({ project, members }) {
  const active = members.filter((m) => m.status === 'active')
  return (
    <>
      <div className="board-toolbar">
        <label className="board-search">
          <Search size={15} />
          <input type="search" placeholder="Search board" aria-label="Search board" />
        </label>
        <div className="avatar-stack" aria-label={`${active.length} active members`}>
          {active.slice(0, 5).map((m) => <span key={m.id} className="avatar" title={m.name}>{initials(m.name)}</span>)}
          {active.length > 5 && <span className="avatar avatar-more">+{active.length - 5}</span>}
        </div>
      </div>
      <div className="board">
        {COLUMNS.map((col, i) => (
          <section className="board-col" key={col} aria-label={col}>
            <h3>{col} <span>0</span></h3>
            {i === 0 && (
              <div className="board-empty">
                No work items yet. The planning agents will create {project.key} tasks from the BRD.
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  )
}

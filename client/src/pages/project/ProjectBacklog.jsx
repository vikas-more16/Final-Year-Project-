import { ChevronDown } from 'lucide-react'

// Methodologies that plan work in time-boxed sprints; the others get a single backlog.
const SPRINT_MODELS = ['Scrum', 'Agile', 'Incremental', 'RAD', 'DevOps']

function Section({ title, meta, children }) {
  return (
    <section className="backlog-section">
      <header>
        <ChevronDown size={16} />
        <h3>{title}</h3>
        <span className="muted">{meta}</span>
        <span className="count">0 work items</span>
      </header>
      <div className="backlog-empty">{children}</div>
    </section>
  )
}

export default function ProjectBacklog({ project }) {
  const sprints = SPRINT_MODELS.includes(project.model)
  return (
    <div className="backlog">
      {sprints && (
        <Section title={`${project.key} Sprint 1`} meta="Not started">
          Plan a sprint by moving work items here from the backlog.
        </Section>
      )}
      <Section title="Backlog" meta={project.model ? `${project.model} project` : ''}>
        Your backlog is empty. The Requirement Analyst and Planner agents will fill it from the BRD.
      </Section>
    </div>
  )
}

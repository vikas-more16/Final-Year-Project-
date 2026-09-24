import re

from ..schemas import ProjectState, Task, TaskOutput
from ..sdlc import DOMAIN_LABELS, normalize_domain
from .base import BaseAgent

# (phase-name keywords, [(title, domain, hours)]) used only by the offline mock.
_TEMPLATES = [
    (("requirement", "backlog"), [("Write requirements / backlog document", "business_analysis", 8),
                                  ("Review scope with stakeholders", "project_management", 4)]),
    (("design",), [("Design system architecture", "backend", 8), ("Design database schema", "database", 8),
                   ("Create UI wireframes", "ui_ux", 10)]),
    (("test",), [("Write and run test cases", "qa_testing", 12), ("Fix reported defects", "backend", 8)]),
    (("deploy", "release"), [("Set up deployment pipeline", "devops", 8), ("Release and smoke-test", "qa_testing", 4),
                             ("Write release notes", "documentation", 3)]),
    (("maintenance",), [("Fix post-release issues", "backend", 8), ("Prepare user documentation", "documentation", 6)]),
    (("implement", "sprint", "iteration", "prototype"),
     [("Implement backend features", "backend", 16), ("Build frontend screens", "frontend", 16),
      ("Set up database access", "database", 8)]),
]


class TaskAgent(BaseAgent):
    name = "task"
    description = "Breaks each phase into concrete tasks and tags each task with the domain needed."

    def run(self, state: ProjectState) -> None:
        phases = ", ".join(p.name for p in state.phases)
        team_domains = sorted({d for m in state.members for d in m.domains})
        system = (
            "You are the Task Planning Agent in a multi-agent project management system. "
            "Break the plan into concrete tasks, 3 to 6 per phase. Each task needs: title, description, "
            f"phase (exactly one of: {phases}), "
            f"domain (exactly one of: {', '.join(DOMAIN_LABELS)}), priority (high|medium|low) and estimate_hours (number). "
            f"Prefer domains the team can cover: {', '.join(team_domains) or 'any'}. "
            'Respond with ONLY a JSON object: {"tasks": [{"title": "...", "description": "...", '
            '"phase": "...", "domain": "...", "priority": "medium", "estimate_hours": 8}]}'
        )
        user = (state.brief() + "\n\nPhases:\n" + "\n".join(f"- {p.name}: {p.goal}" for p in state.phases)
                + "\n\nRequirements:\n" + "\n".join(f"- {r.title}" for r in state.requirements))
        out = self.ask_llm(state, system, user, lambda: self._mock(state, team_domains), TaskOutput)

        valid = {p.name.lower(): p.name for p in state.phases}
        tasks, dropped = [], 0
        for d in out.tasks:
            phase = valid.get(d.phase.strip().lower()) or next(
                (name for low, name in valid.items() if low in d.phase.lower()), None)
            if not phase:
                dropped += 1
                continue
            tasks.append(Task(
                id=f"T-{len(tasks) + 1:03d}", title=d.title.strip(), description=d.description, phase=phase,
                domain=normalize_domain(d.domain),
                priority=d.priority.lower() if d.priority.lower() in ("high", "medium", "low") else "medium",
                estimate_hours=min(max(d.estimate_hours, 1), 80), status="locked"))
        if dropped:
            state.log(self.name, "orchestrator", "warning", f"{dropped} task(s) dropped: unknown phase name")
        if not tasks:
            raise RuntimeError("Task agent produced no usable tasks")
        state.tasks = tasks

    @staticmethod
    def _mock(state: ProjectState, team_domains: list) -> dict:
        text = f"{state.description} {state.objective} {state.documents}".lower()
        wants_ai = bool(re.search(r"\b(ai|ml|llm|machine learning)\b", text))
        tasks = []
        for ph in state.phases:
            name = ph.name.lower()
            tpl = list(next((t for keys, t in _TEMPLATES if any(k in name for k in keys)),
                            [("Complete phase work", "general", 8)]))
            if wants_ai and any(k in name for k in ("implement", "sprint", "iteration", "prototype")):
                tpl.append(("Integrate AI/ML component", "ai_ml", 12))
            if team_domains:   # only plan work the team can actually cover
                tpl = [t for t in tpl if t[1] in team_domains or t[1] in ("general", "project_management")] \
                      or [("Complete phase work", team_domains[0], 8)]
            for title, domain, hours in tpl:
                tasks.append({"title": title, "description": f"{title} for {state.name} ({ph.name}).",
                              "phase": ph.name, "domain": domain, "priority": "medium", "estimate_hours": hours})
        return {"tasks": tasks}

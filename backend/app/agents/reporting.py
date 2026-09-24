import json

from ..schemas import ProjectState
from .base import BaseAgent


class ReportingAgent(BaseAgent):
    name = "reporting"
    description = "Writes a human-readable progress report for the project leader."
    SYSTEM = (
        "You are the Reporting Agent in a multi-agent project management system. Write a concise status "
        "report in Markdown for the project leader with sections: Overview, Progress, Phase status, "
        "Team workload, Risks, Next steps. Use only the facts provided; do not invent numbers."
    )

    def run(self, state: ProjectState) -> None:
        facts = json.dumps({
            "project": state.name, "sdlc_model": state.sdlc_model, "status": state.status,
            "monitoring": state.monitoring, "assignments": state.assignments}, indent=1, default=str)
        state.report = self.ask_text(state, self.SYSTEM, facts, lambda: self._mock(state))

    @staticmethod
    def _mock(state: ProjectState) -> str:
        m = state.monitoring
        lines = [f"# Status report: {state.name}", "",
                 f"**SDLC model:** {state.sdlc_model}  |  **Status:** {state.status}  |  "
                 f"**Current phase:** {state.current_phase or '-'}  |  **Health:** {m.get('health')}", "",
                 f"**Progress:** {m.get('progress_pct', 0)}% ({m.get('done', 0)}/{m.get('total_tasks', 0)} tasks done)", "",
                 "## Phase status"]
        lines += [f"- {p['phase']}: {p['done']}/{p['total']} done" for p in m.get("phases", [])]
        lines += ["", "## Team workload"]
        lines += [f"- {a['name']} ({a['project_role']}): {a['task_count']} tasks, {a['open_hours']}h open"
                  for a in state.assignments]
        lines += ["", "## Risks"] + ([f"- {f}" for f in m.get("flags", [])] or ["- None flagged."])
        lines += ["", "## Next steps"]
        cur = [t for t in state.tasks if t.phase == state.current_phase and t.status != "done"]
        lines += [f"- {t.title} ({t.assignee})" for t in cur[:5]] or ["- Nothing pending."]
        return "\n".join(lines)

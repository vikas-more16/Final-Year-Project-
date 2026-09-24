from datetime import date

from ..schemas import ProjectState, now_iso
from .base import BaseAgent


class MonitoringAgent(BaseAgent):
    name = "monitoring"
    description = "Computes progress, workload and risks (blocked or overdue tasks). Pure code - no LLM needed."

    def run(self, state: ProjectState) -> None:
        today = date.today().isoformat()
        tasks = state.tasks
        total = len(tasks)
        count = lambda status: sum(t.status == status for t in tasks)
        done = count("done")
        overdue = [t for t in tasks if t.status != "done" and t.due_date and t.due_date < today]
        blocked = [t for t in tasks if t.status == "blocked"]

        phases = []
        for p in state.phases:
            pt = [t for t in tasks if t.phase == p.name]
            pd = sum(t.status == "done" for t in pt)
            phases.append({"phase": p.name, "total": len(pt), "done": pd,
                           "progress_pct": round(100 * pd / len(pt)) if pt else 0})

        members = []
        for m in state.members:
            mt = [t for t in tasks if t.assignee == m.email]
            members.append({"email": m.email, "name": m.display(), "total": len(mt),
                            "done": sum(t.status == "done" for t in mt),
                            "open_hours": sum(t.estimate_hours for t in mt if t.status != "done")})

        flags = [f"Task {t.id} '{t.title}' is blocked (assignee: {t.assignee})" for t in blocked]
        flags += [f"Task {t.id} '{t.title}' is overdue (due {t.due_date})" for t in overdue]
        health = ("completed" if state.status == "completed" else "delayed" if overdue
                  else "at_risk" if blocked else "on_track")

        state.monitoring = {
            "checked_at": now_iso(), "current_phase": state.current_phase, "health": health,
            "total_tasks": total, "done": done, "in_progress": count("in_progress"), "todo": count("todo"),
            "blocked": len(blocked), "locked": count("locked"),
            "progress_pct": round(100 * done / total) if total else 0,
            "phases": phases, "members": members,
            "overdue": [{"id": t.id, "title": t.title, "assignee": t.assignee, "due_date": t.due_date} for t in overdue],
            "flags": flags,
        }

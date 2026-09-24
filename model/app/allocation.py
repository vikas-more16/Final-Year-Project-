"""Task allocation: WHO does each task.

Design decision: the LLM decides WHAT work exists (planning); plain code decides WHO does it.
Allocation is then deterministic, explainable in a viva, and unit-testable:
  1. match the task's domain to members who have that domain
  2. among matches, pick the member with the lowest open workload (hours)
  3. management tasks go to Admin/Leader; unmatched domains fall back to the least-loaded member
"""
from .schemas import LEADER_ROLES, ProjectState, Task
from .sdlc import DOMAIN_LABELS

_PRIORITY = {"high": 0, "medium": 1, "low": 2}


def allocate(state: ProjectState, tasks: list[Task]) -> None:
    """Assign every task in `tasks` to an available member (mutates the tasks)."""
    members = [m for m in state.members if m.available]
    moving = {t.id for t in tasks}
    load = {m.email: 0.0 for m in members}
    for t in state.tasks:                                   # workload already carried by each member
        if t.id not in moving and t.assignee in load and t.status != "done":
            load[t.assignee] += t.estimate_hours

    for t in sorted(tasks, key=lambda t: (_PRIORITY.get(t.priority, 1), -t.estimate_hours)):
        if not members:
            t.assignee, t.allocation_note = None, "No available members."
            continue
        if t.domain == "project_management":
            pool = [m for m in members if m.role in LEADER_ROLES] or members
            note = "Management task assigned to a leader/admin."
        elif t.domain == "general":
            pool, note = members, "General task assigned to the least-loaded member."
        else:
            pool = [m for m in members if t.domain in m.domains]
            note = f"Matched on domain '{t.domain}', lowest workload."
            if not pool:
                pool = members
                note = f"No available member has domain '{t.domain}'; given to the least-loaded member."
        best = min(pool, key=lambda m: load[m.email])
        t.assignee, t.allocation_note = best.email, note
        load[best.email] += t.estimate_hours


def build_assignments(state: ProjectState) -> list[dict]:
    """Per-member summary: project role (from domain), tasks and workload."""
    out = []
    for m in state.members:
        mine = [t for t in state.tasks if t.assignee == m.email]
        primary = next((d for d in m.domains if d in DOMAIN_LABELS), None)
        title = DOMAIN_LABELS.get(primary, "Team Member")
        if m.role in LEADER_ROLES:
            title = "Project Leader" + (f" / {title}" if primary else "")
        out.append({
            "email": m.email, "name": m.display(), "access_role": m.role, "project_role": title,
            "domains": m.domains, "available": m.available,
            "task_ids": [t.id for t in mine], "task_count": len(mine),
            "open_hours": sum(t.estimate_hours for t in mine if t.status != "done"),
        })
    return out

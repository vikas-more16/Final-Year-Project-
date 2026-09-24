"""THE MAIN AGENT: the Orchestrator.

Responsibilities
  1. Workflow control : runs the project through the SDLC model the leader selected
                        (requirement -> planning -> task -> allocation -> monitoring -> reporting)
  2. Task allocation  : assigns every task to a team member by domain and workload
  3. Phase gating     : tasks of phase N+1 stay 'locked' until every task of phase N is 'done'
  4. Reacting to events: task updates re-trigger monitoring and can advance the phase
  5. Routing          : free-text messages from the leader are routed to the right action
  6. Reliability      : every step is logged as an agent<->agent event; bad LLM output falls back

The orchestrator holds no data itself. All memory lives in ProjectState (persisted by the API layer).
"""
from __future__ import annotations

import time
from datetime import date, timedelta

from . import llm
from .agents import build_agents
from .allocation import allocate, build_assignments
from .schemas import LEADER_ROLES, ProjectState, Task
from .sdlc import SDLC_MODELS

MEMBER_STATUSES = ("todo", "in_progress", "blocked", "done")
ROUTER_ACTIONS = ("status", "report", "reallocate")


class OrchestratorError(Exception):
    """Invalid request (maps to HTTP 400)."""


class NotFoundError(OrchestratorError):
    """Unknown project / task / member (maps to HTTP 404)."""


class Orchestrator:
    def __init__(self, agents: dict | None = None):
        self.agents = agents or build_agents()

    # ------------------------------------------------------------------ dispatch
    def _dispatch(self, state: ProjectState, agent_name: str) -> None:
        state.log("orchestrator", agent_name, "dispatch", f"Running the {agent_name} agent")
        t0 = time.time()
        self.agents[agent_name].run(state)
        state.log(agent_name, "orchestrator", "done", f"{agent_name} agent finished in {time.time() - t0:.1f}s")

    # ------------------------------------------------------- 1. start the project
    def prepare_start(self, state: ProjectState, sdlc_model: str) -> ProjectState:
        """Validate the request and reset the project. Fast; the slow part is run_kickoff()."""
        key = (sdlc_model or "").strip().lower()
        if key not in SDLC_MODELS:
            raise OrchestratorError(f"Unknown SDLC model '{sdlc_model}'. Choose from: {', '.join(SDLC_MODELS)}")
        if state.status not in ("draft", "failed"):
            raise OrchestratorError(f"Project is already '{state.status}'")
        if not state.members:
            raise OrchestratorError("Add at least one team member before starting")

        state.requirements, state.phases, state.tasks = [], [], []
        state.assignments, state.monitoring, state.report, state.error = [], {}, "", ""
        state.sdlc_model, state.status, state.stage = key, "running", "queued"
        state.log("leader", "orchestrator", "sdlc_selected", f"Leader selected the {SDLC_MODELS[key]['label']} model")
        return state

    def run_kickoff(self, state: ProjectState, on_progress=None) -> ProjectState:
        """The slow part (LLM calls). `on_progress(state)` is called after every step so the API can save
        the state and the frontend can poll `state.stage` to show which agent is working."""
        def notify():
            if on_progress:
                on_progress(state)

        def step(name):
            state.stage = name
            notify()
            self._dispatch(state, name)
            notify()

        try:
            for name in ("requirement", "planning", "task"):
                step(name)
            state.stage = "allocation"
            notify()
            self._schedule(state)
            self._allocate(state, state.tasks)
            self._activate_phase(state, state.phases[0].name)
            self._advance_if_done(state)              # handles a first phase that has no tasks
            for name in ("monitoring", "reporting"):
                step(name)
            state.stage = "done"
            notify()
        except Exception as e:
            state.status, state.stage, state.error = "failed", "failed", str(e)
            state.log("orchestrator", "leader", "error", f"Kickoff failed: {e}")
            raise
        return state

    def start_project(self, state: ProjectState, sdlc_model: str, on_progress=None) -> ProjectState:
        """Called when the leader selects the SDLC model. Runs the whole kickoff workflow (blocking)."""
        self.prepare_start(state, sdlc_model)
        return self.run_kickoff(state, on_progress)

    def _schedule(self, state: ProjectState) -> None:
        """Turn phase durations into calendar dates; each task is due at the end of its phase."""
        cursor = date.today()
        for p in state.phases:
            p.start_date = cursor.isoformat()
            cursor += timedelta(days=p.duration_days)
            p.end_date = cursor.isoformat()
        ends = {p.name: p.end_date for p in state.phases}
        for t in state.tasks:
            t.due_date = ends.get(t.phase)

    def _allocate(self, state: ProjectState, tasks: list[Task]) -> None:
        allocate(state, tasks)
        state.assignments = build_assignments(state)
        fallback = sum(1 for t in tasks if t.allocation_note.startswith("No available"))
        state.log("orchestrator", "team", "allocation",
                  f"Allocated {len(tasks)} task(s) across {sum(a['task_count'] > 0 for a in state.assignments)} "
                  f"member(s)" + (f"; {fallback} had no domain match" if fallback else ""))

    # ------------------------------------------------------- 2. phase gating
    def _activate_phase(self, state: ProjectState, phase: str) -> None:
        state.current_phase = phase
        unlocked = 0
        for t in state.tasks:
            if t.phase == phase and t.status == "locked":
                t.status, unlocked = "todo", unlocked + 1
        state.log("orchestrator", "team", "phase_started", f"Phase '{phase}' started; {unlocked} task(s) unlocked")

    def _advance_if_done(self, state: ProjectState) -> None:
        names = [p.name for p in state.phases]
        while state.status == "running":
            current = state.current_phase
            if any(t.status != "done" for t in state.tasks if t.phase == current):
                return
            state.log("orchestrator", "team", "phase_completed", f"Phase '{current}' completed")
            i = names.index(current)
            if i + 1 >= len(names):
                state.status, state.current_phase = "completed", None
                state.log("orchestrator", "leader", "project_completed", "All phases completed")
                self._dispatch(state, "monitoring")
                self._dispatch(state, "reporting")
                return
            self._activate_phase(state, names[i + 1])

    # ------------------------------------------------------- 3. reacting to members
    def update_task(self, state: ProjectState, task_id: str, status: str, actor: str | None = None) -> Task:
        if status not in MEMBER_STATUSES:
            raise OrchestratorError(f"Status must be one of: {', '.join(MEMBER_STATUSES)}")
        task = next((t for t in state.tasks if t.id == task_id), None)
        if task is None:
            raise NotFoundError(f"Task '{task_id}' not found")
        if state.status != "running":
            raise OrchestratorError(f"Project is '{state.status}', tasks can't be updated")
        if state.stage not in ("", "done"):
            raise OrchestratorError("Project kickoff is still in progress")
        if task.status == "locked":
            raise OrchestratorError(f"Task is locked until phase '{task.phase}' starts")

        old, task.status = task.status, status
        state.log(actor or task.assignee or "member", "orchestrator", "task_update",
                  f"{task.id} '{task.title}': {old} -> {status}")
        if status == "blocked":
            state.log("orchestrator", "leader", "escalation",
                      f"Task {task.id} '{task.title}' is blocked (assignee: {task.assignee})")
        self._advance_if_done(state)
        self._dispatch(state, "monitoring")
        return task

    def reallocate_member(self, state: ProjectState, email: str) -> list[dict]:
        """A member is unavailable: move their unfinished tasks to the rest of the team."""
        member = next((m for m in state.members if m.email.lower() == email.lower()), None)
        if member is None:
            raise NotFoundError(f"Member '{email}' not found")
        member.available = False
        moving = [t for t in state.tasks if t.assignee == member.email and t.status != "done"]
        for t in moving:
            t.assignee = None
        allocate(state, moving)
        state.assignments = build_assignments(state)
        state.log("orchestrator", "team", "reallocation",
                  f"{member.display()} marked unavailable; {len(moving)} task(s) reassigned")
        self._dispatch(state, "monitoring")
        return [{"task_id": t.id, "title": t.title, "new_assignee": t.assignee} for t in moving]

    # ------------------------------------------------------- 4. routing free text
    def handle_message(self, state: ProjectState, message: str) -> dict:
        state.log("leader", "orchestrator", "message", message[:200])
        if state.status == "draft":
            return {"action": "unknown", "message": "The project hasn't started. Select an SDLC model first."}
        if state.stage not in ("", "done"):
            return {"action": "unknown", "message": "Kickoff is still in progress, try again in a moment."}
        decision = self._route(state, message)
        action = decision["action"]
        if action == "status":
            self._dispatch(state, "monitoring")
            return {"action": "status", "monitoring": state.monitoring}
        if action == "report":
            self._dispatch(state, "monitoring")
            self._dispatch(state, "reporting")
            return {"action": "report", "report": state.report}
        if action == "reallocate":
            if not decision["member"]:
                return {"action": "clarify", "message": "Which team member is unavailable? Mention their name or email."}
            return {"action": "reallocate", "member": decision["member"],
                    "moved": self.reallocate_member(state, decision["member"])}
        return {"action": "unknown",
                "message": "I can show project status, write a report, or reassign an unavailable member's tasks."}

    def _route(self, state: ProjectState, message: str) -> dict:
        system = (
            "You are the Orchestrator of a multi-agent project management system. Choose ONE action for the "
            'leader\'s message: "status" (progress, delays, workload), "report" (write a report), '
            '"reallocate" (a team member is unavailable, move their tasks), or "unknown". '
            f"Team: {', '.join(f'{m.display()} <{m.email}>' for m in state.members)}. "
            'Respond with ONLY JSON: {"action": "...", "member": "<email or null>"}')
        try:
            raw = llm.complete_json(system, message, lambda: self._keyword_route(state, message))
        except llm.LLMError as e:
            state.log("orchestrator", "orchestrator", "fallback", f"Router LLM failed ({str(e)[:100]}); used keywords")
            raw = self._keyword_route(state, message)
        action = raw.get("action") if raw.get("action") in ROUTER_ACTIONS else "unknown"
        member = self._find_member(state, raw.get("member")) or self._find_member(state, message)
        return {"action": action, "member": member if action == "reallocate" else None}

    @staticmethod
    def _keyword_route(state: ProjectState, message: str) -> dict:
        m = message.lower()
        if any(k in m for k in ("leave", "unavailable", "sick", "absent", "reassign", "reallocate", "resign")):
            return {"action": "reallocate", "member": None}
        if "report" in m or "summary" in m:
            return {"action": "report", "member": None}
        if any(k in m for k in ("status", "progress", "delay", "late", "overdue", "workload", "how")):
            return {"action": "status", "member": None}
        return {"action": "unknown", "member": None}

    @staticmethod
    def _find_member(state: ProjectState, text) -> str | None:
        text = str(text or "").lower()
        if not text:
            return None
        for m in state.members:
            local = m.email.split("@")[0].lower()
            if m.email.lower() in text or m.display().lower() in text or (len(local) >= 3 and local in text):
                return m.email
        return None

    # ------------------------------------------------------- helpers for the API
    @staticmethod
    def is_leader(state: ProjectState, email: str) -> bool:
        return any(m.email.lower() == email.lower() and m.role in LEADER_ROLES for m in state.members)

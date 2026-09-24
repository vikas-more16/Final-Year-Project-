"""Data models. ProjectState is the shared memory ('blackboard') every agent reads and writes."""
import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from .sdlc import normalize_domain

LEADER_ROLES = ("Admin", "Leader")   # matches the role dropdown in the React app


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Member(BaseModel):
    email: str
    name: str = ""
    role: str = "Team member"                       # Admin | Leader | Team member
    domains: list[str] = Field(default_factory=list)  # e.g. ["frontend", "ui_ux"]
    available: bool = True

    @field_validator("domains")
    @classmethod
    def _clean_domains(cls, v):
        out = []
        for d in v:
            d = normalize_domain(d)
            if d != "general" and d not in out:
                out.append(d)
        return out

    def display(self) -> str:
        return self.name or self.email.split("@")[0].title()


class Event(BaseModel):
    ts: str = Field(default_factory=now_iso)
    sender: str
    receiver: str
    kind: str
    message: str


class RequirementItem(BaseModel):
    title: str
    type: str = "functional"
    priority: str = "medium"


class PhasePlan(BaseModel):
    name: str
    goal: str = ""
    duration_days: int = 7
    deliverables: list[str] = Field(default_factory=list)
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class TaskDraft(BaseModel):
    title: str
    description: str = ""
    phase: str
    domain: str = "general"
    priority: str = "medium"
    estimate_hours: float = 8


class Task(BaseModel):
    id: str
    title: str
    description: str = ""
    phase: str
    domain: str = "general"
    priority: str = "medium"
    estimate_hours: float = 8
    assignee: Optional[str] = None       # member email
    status: str = "locked"               # locked | todo | in_progress | blocked | done
    due_date: Optional[str] = None
    allocation_note: str = ""


# ---- what each LLM-backed agent must return (validated before use) ----
class RequirementOutput(BaseModel):
    requirements: list[RequirementItem]


class PlanOutput(BaseModel):
    phases: list[PhasePlan]


class TaskOutput(BaseModel):
    tasks: list[TaskDraft]


class ProjectState(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    name: str
    description: str = ""
    mission: str = ""
    vision: str = ""
    objective: str = ""
    documents: str = ""                  # text of BRD / work order / extra documents
    members: list[Member] = Field(default_factory=list)

    sdlc_model: Optional[str] = None
    status: str = "draft"                # draft | running | completed | failed
    current_phase: Optional[str] = None
    requirements: list[RequirementItem] = Field(default_factory=list)
    phases: list[PhasePlan] = Field(default_factory=list)
    tasks: list[Task] = Field(default_factory=list)
    assignments: list[dict] = Field(default_factory=list)
    monitoring: dict = Field(default_factory=dict)
    report: str = ""
    events: list[Event] = Field(default_factory=list)   # agent <-> agent message log
    error: str = ""
    created_at: str = Field(default_factory=now_iso)

    def log(self, sender: str, receiver: str, kind: str, message: str) -> None:
        self.events.append(Event(sender=sender, receiver=receiver, kind=kind, message=message))

    def brief(self, max_doc_chars: int = 6000) -> str:
        team = ", ".join(f"{m.display()} ({m.role}; domains: {', '.join(m.domains) or 'unspecified'})"
                         for m in self.members)
        return (f"Project: {self.name}\nDescription: {self.description}\nMission: {self.mission}\n"
                f"Vision: {self.vision}\nObjective: {self.objective}\nSDLC model: {self.sdlc_model}\n"
                f"Team: {team}\nDocuments:\n{self.documents[:max_doc_chars]}")

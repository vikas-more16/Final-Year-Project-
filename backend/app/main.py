"""REST API around the orchestrator. Run:  uvicorn app.main:app --reload --port 8000"""
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

from . import llm, store  # noqa: E402  (after load_dotenv so env vars are set)
from .orchestrator import NotFoundError, Orchestrator, OrchestratorError  # noqa: E402
from .schemas import Member, ProjectState  # noqa: E402
from .sdlc import DOMAIN_LABELS, SDLC_MODELS  # noqa: E402

app = FastAPI(title="Orchestra - Orchestrator Service")
app.add_middleware(
    CORSMiddleware, allow_methods=["*"], allow_headers=["*"],
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","))
orch = Orchestrator()


class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    mission: str = ""
    vision: str = ""
    objective: str = ""
    documents: str = ""                              # text of BRD / work order
    members: list[Member] = Field(default_factory=list)


class StartRequest(BaseModel):
    sdlc_model: str
    requested_by: Optional[str] = None               # email of the leader (optional check)


class TaskUpdate(BaseModel):
    status: str
    actor: Optional[str] = None


class ChatRequest(BaseModel):
    message: str


def _get(project_id: str) -> ProjectState:
    state = store.load(project_id)
    if state is None:
        raise HTTPException(404, f"Project '{project_id}' not found")
    return state


def _run(fn, *args, **kwargs):
    """Translate orchestrator errors into HTTP errors."""
    try:
        return fn(*args, **kwargs)
    except NotFoundError as e:
        raise HTTPException(404, str(e))
    except OrchestratorError as e:
        raise HTTPException(400, str(e))


@app.get("/health")
def health():
    return {"ok": True, "llm_provider": os.getenv("LLM_PROVIDER", "mock"), "mock_mode": llm.is_mock()}


@app.get("/sdlc-models")
def sdlc_models():
    return [{"key": k, "label": v["label"], "description": v["description"],
             "phases": [p["name"] for p in v["phases"]]} for k, v in SDLC_MODELS.items()]


@app.get("/domains")
def domains():
    return [{"key": k, "label": v} for k, v in DOMAIN_LABELS.items()]


@app.post("/projects", status_code=201)
def create_project(body: ProjectCreate):
    state = ProjectState(**body.model_dump())
    state.log("system", "orchestrator", "project_created", f"Project '{state.name}' created with {len(state.members)} member(s)")
    store.save(state)
    return state


@app.get("/projects")
def list_projects():
    return [{"id": s.id, "name": s.name, "status": s.status, "sdlc_model": s.sdlc_model} for s in store.list_all()]


@app.get("/projects/{project_id}")
def get_project(project_id: str):
    return _get(project_id)


@app.post("/projects/{project_id}/start")
def start_project(project_id: str, body: StartRequest):
    """Leader selects the SDLC model -> the orchestrator takes over."""
    state = _get(project_id)
    if body.requested_by and not orch.is_leader(state, body.requested_by):
        raise HTTPException(403, "Only an Admin or Leader can start the project")
    try:
        _run(orch.start_project, state, body.sdlc_model)
    except HTTPException:
        raise
    except Exception as e:
        store.save(state)                                # keep the 'failed' state + event log
        raise HTTPException(500, f"Orchestration failed: {e}")
    store.save(state)
    return state


@app.get("/projects/{project_id}/tasks")
def get_tasks(project_id: str, assignee: Optional[str] = None):
    tasks = _get(project_id).tasks
    return [t for t in tasks if not assignee or (t.assignee or "").lower() == assignee.lower()]


@app.patch("/projects/{project_id}/tasks/{task_id}")
def update_task(project_id: str, task_id: str, body: TaskUpdate):
    state = _get(project_id)
    task = _run(orch.update_task, state, task_id, body.status, body.actor)
    store.save(state)
    return {"task": task, "project_status": state.status, "current_phase": state.current_phase,
            "monitoring": state.monitoring}


@app.post("/projects/{project_id}/chat")
def chat(project_id: str, body: ChatRequest):
    state = _get(project_id)
    result = _run(orch.handle_message, state, body.message)
    store.save(state)
    return result


@app.get("/projects/{project_id}/assignments")
def assignments(project_id: str):
    return _get(project_id).assignments


@app.get("/projects/{project_id}/events")
def events(project_id: str):
    return _get(project_id).events

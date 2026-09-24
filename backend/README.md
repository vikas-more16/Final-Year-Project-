# Orchestrator service (the main agent)

Python/FastAPI service that sits next to the React app. The leader selects an SDLC model, the
orchestrator takes over: runs the sub-agents, allocates tasks by domain, gates phases, monitors, reports.

```
frontend (React)  --REST-->  FastAPI (app/main.py)  -->  Orchestrator (app/orchestrator.py)
                                                          |-- requirement agent
                                                          |-- planning agent
                                                          |-- task agent
                                                          |-- allocation (app/allocation.py)
                                                          |-- monitoring agent
                                                          '-- reporting agent
                                     shared memory = ProjectState (SQLite JSON)
```

## Run (Python 3.9+)
```bash
cd backend
python -m venv venv && venv\Scripts\activate        # Windows  (Linux/Mac: source venv/bin/activate)
pip install -r requirements.txt
python tests/test_flow.py                            # should print ALL TESTS PASSED
uvicorn app.main:app --reload --port 8000            # docs at http://localhost:8000/docs
```
Default `LLM_PROVIDER=mock` runs fully offline. For a real LLM copy `.env.example` to `.env`,
set `LLM_PROVIDER` + key, and `pip install` that provider's SDK. Check `events` for `fallback`
entries: they mean the LLM reply was unusable and the built-in fallback was used.

## API contract (for the frontend team)
| Method + path | Purpose |
|---|---|
| `GET /sdlc-models` , `GET /domains` | dropdown options |
| `POST /projects` | create project: `name, description, mission, vision, objective, documents, members[{email,name,role,domains[]}]` |
| `POST /projects/{id}/start` | **leader selects SDLC model** `{sdlc_model:"waterfall", requested_by:"leader@x.com"}` -> orchestration runs |
| `GET /projects/{id}` | full state (phases, tasks, assignments, monitoring, report, events) |
| `GET /projects/{id}/tasks?assignee=email` | a member's task list |
| `PATCH /projects/{id}/tasks/{task_id}` | `{status: todo\|in_progress\|blocked\|done}` |
| `POST /projects/{id}/chat` | `{message}` -> status / report / reassign |
| `GET /projects/{id}/assignments`, `/events` | who-does-what, agent-to-agent log |

## What the frontend must add
1. **Domain** (multi-select from `GET /domains`) next to the role when adding a member. Without it, allocation has nothing to match on.
2. Project creation form (name, description, mission, vision, objective, BRD/WO text).
3. SDLC model picker (leader only) that calls `/start`.
4. Member view of their tasks + status buttons.

## Plugging in a teammate's agent
Implement `BaseAgent.run(state)` (see `app/agents/base.py`), then replace its entry in
`app/agents/__init__.py`. The orchestrator does not change.

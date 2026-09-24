# backend/  - HTTP API + persistence

Thin layer around the AI code in `../model`. It owns routes, request validation, CORS, `.env` loading and SQLite.
All project logic lives in `model/`; this folder never contains orchestration logic.

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI routes (calls `model.Orchestrator`) |
| `app/store.py` | SQLite persistence: one JSON row per project |
| `app/__init__.py` | puts the repo root on `sys.path` so `import model` works |
| `tests/test_flow.py` | API-level tests (FastAPI TestClient, mock LLM) |
| `e2e_check.py` | Pre-flight check against a RUNNING server (same calls as the UI) |
| `seed_demo.py` | Loads your real project + team, prints a quality report (prompt tuning) |
| `.env.example` | Copy to `.env` (LLM provider + keys, DB path, CORS) |

## Run (from `backend/`)
```bash
pip install -r requirements.txt
python tests/test_flow.py
uvicorn app.main:app --reload --reload-dir . --reload-dir ../model --port 8000     # docs: /docs
python e2e_check.py                                                                # in a 2nd terminal
```
`--reload-dir ../model` makes the server restart when you edit AI code. For a demo or a long real-LLM run, start
WITHOUT `--reload` (a restart mid-run would interrupt the orchestration).

## API contract
See the table in the previous README section: `/sdlc-models, /domains, POST /projects, POST /projects/{id}/start-async,
GET /projects/{id}, GET /projects/{id}/tasks?assignee=, PATCH /projects/{id}/tasks/{task_id}, POST /projects/{id}/chat,
GET /projects/{id}/events`. Interactive docs: http://localhost:8000/docs

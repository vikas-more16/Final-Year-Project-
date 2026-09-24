"""Tiny SQLite persistence: one row per project, state stored as JSON."""
import os
import sqlite3
import threading
from contextlib import closing
from pathlib import Path
from typing import Optional

from model import ProjectState

BACKEND_DIR = Path(__file__).resolve().parents[1]

_lock = threading.Lock()


def _conn():
    db = Path(os.getenv("ORCH_DB") or "orchestrator.db")
    c = sqlite3.connect(db if db.is_absolute() else BACKEND_DIR / db)   # relative paths live in backend/
    c.execute("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL)")
    return c


def save(state: ProjectState) -> None:
    with _lock, closing(_conn()) as c, c:
        c.execute("INSERT INTO projects(id, data) VALUES(?, ?) "
                  "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                  (state.id, state.model_dump_json()))


def load(project_id: str) -> Optional[ProjectState]:
    with _lock, closing(_conn()) as c:
        row = c.execute("SELECT data FROM projects WHERE id = ?", (project_id,)).fetchone()
    return ProjectState.model_validate_json(row[0]) if row else None


def list_all() -> list[ProjectState]:
    with _lock, closing(_conn()) as c:
        rows = c.execute("SELECT data FROM projects").fetchall()
    return [ProjectState.model_validate_json(r[0]) for r in rows]

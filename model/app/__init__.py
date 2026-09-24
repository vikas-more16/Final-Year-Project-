"""Backend API package. Puts the repository root on sys.path so the sibling `model/` package is importable
whether you start the server from backend/ (uvicorn app.main:app) or from the repo root."""
import sys
from pathlib import Path

_ROOT = str(Path(__file__).resolve().parents[2])
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

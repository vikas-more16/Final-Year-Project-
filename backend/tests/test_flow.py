"""End-to-end test of the orchestrator in mock mode:  python tests/test_flow.py   (or: pytest)"""
import os
import sys
import tempfile

os.environ["LLM_PROVIDER"] = "mock"
os.environ["ORCH_DB"] = os.path.join(tempfile.mkdtemp(), "test.db")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

client = TestClient(app)

MEMBERS = [
    {"email": "shruti@college.edu", "name": "Shruti", "role": "Leader", "domains": ["Project Management"]},
    {"email": "vikas@college.edu", "name": "Vikas", "role": "Team member", "domains": ["backend", "database"]},
    {"email": "yash@college.edu", "name": "Yash", "role": "Team member", "domains": ["Front-End", "UI/UX"]},
    {"email": "vaishnavi@college.edu", "name": "Vaishnavi", "role": "Team member", "domains": ["QA", "documentation"]},
    {"email": "sairaj@college.edu", "name": "Sairaj", "role": "Team member", "domains": ["devops", "business_analysis"]},
]


def make_project():
    r = client.post("/projects", json={"name": "College ERP", "description": "Portal for student records.",
                                       "objective": "Working MVP", "members": MEMBERS})
    assert r.status_code == 201
    return r.json()["id"]


def test_full_lifecycle():
    pid = make_project()

    # only a leader may start; unknown model rejected
    assert client.post(f"/projects/{pid}/start", json={"sdlc_model": "waterfall", "requested_by": "yash@college.edu"}).status_code == 403
    assert client.post(f"/projects/{pid}/start", json={"sdlc_model": "banana"}).status_code == 400

    s = client.post(f"/projects/{pid}/start", json={"sdlc_model": "waterfall", "requested_by": "shruti@college.edu"}).json()
    assert s["status"] == "running" and s["current_phase"] == "Requirements"
    assert len(s["phases"]) == 6 and s["tasks"] and s["requirements"]
    assert all(t["assignee"] for t in s["tasks"]), "every task must be allocated"
    assert all(t["status"] == "todo" for t in s["tasks"] if t["phase"] == "Requirements")
    assert all(t["status"] == "locked" for t in s["tasks"] if t["phase"] != "Requirements")
    assert s["monitoring"]["progress_pct"] == 0 and s["report"]

    # domain matching: database task must go to Vikas (only DB person)
    db_tasks = [t for t in s["tasks"] if t["domain"] == "database"]
    assert db_tasks and all(t["assignee"] == "vikas@college.edu" for t in db_tasks)

    # locked tasks cannot be touched
    locked = next(t for t in s["tasks"] if t["status"] == "locked")
    assert client.patch(f"/projects/{pid}/tasks/{locked['id']}", json={"status": "done"}).status_code == 400

    # finishing the whole Requirements phase unlocks Design
    for t in [t for t in s["tasks"] if t["phase"] == "Requirements"]:
        r = client.patch(f"/projects/{pid}/tasks/{t['id']}", json={"status": "done"}).json()
    assert r["current_phase"] == "Design"
    tasks = client.get(f"/projects/{pid}/tasks").json()
    assert all(t["status"] == "todo" for t in tasks if t["phase"] == "Design")

    # blocked task -> escalation + at_risk
    d = next(t for t in tasks if t["phase"] == "Design")
    r = client.patch(f"/projects/{pid}/tasks/{d['id']}", json={"status": "blocked"}).json()
    assert r["monitoring"]["health"] == "at_risk"
    client.patch(f"/projects/{pid}/tasks/{d['id']}", json={"status": "todo"})

    # chat routing + reallocation
    assert client.post(f"/projects/{pid}/chat", json={"message": "how is the progress?"}).json()["action"] == "status"
    assert client.post(f"/projects/{pid}/chat", json={"message": "give me a report"}).json()["action"] == "report"
    assert client.post(f"/projects/{pid}/chat", json={"message": "someone is on leave"}).json()["action"] == "clarify"
    res = client.post(f"/projects/{pid}/chat", json={"message": "Vikas is on leave, reassign his work"}).json()
    assert res["action"] == "reallocate" and res["moved"]
    assert all(m["new_assignee"] != "vikas@college.edu" for m in res["moved"])

    # finish everything -> project completes
    for _ in range(10):
        p = client.get(f"/projects/{pid}").json()
        if p["status"] == "completed":
            break
        for t in [t for t in p["tasks"] if t["status"] in ("todo", "in_progress", "blocked")]:
            client.patch(f"/projects/{pid}/tasks/{t['id']}", json={"status": "done"})
    p = client.get(f"/projects/{pid}").json()
    assert p["status"] == "completed" and p["monitoring"]["progress_pct"] == 100

    kinds = {e["kind"] for e in client.get(f"/projects/{pid}/events").json()}
    assert {"sdlc_selected", "dispatch", "allocation", "phase_started", "phase_completed",
            "escalation", "reallocation", "project_completed"} <= kinds


def test_other_sdlc_models():
    for model, first in (("agile", "Backlog & Sprint Planning"), ("iterative", "Initial Prototype")):
        pid = make_project()
        s = client.post(f"/projects/{pid}/start", json={"sdlc_model": model}).json()
        assert s["current_phase"] == first and all(t["assignee"] for t in s["tasks"])


def test_no_domain_match_falls_back():
    pid = client.post("/projects", json={"name": "AI Bot", "description": "An AI chatbot for support",
                                         "members": [{"email": "solo@x.com", "role": "Leader"}]}).json()["id"]
    s = client.post(f"/projects/{pid}/start", json={"sdlc_model": "waterfall"}).json()
    assert all(t["assignee"] == "solo@x.com" for t in s["tasks"])


if __name__ == "__main__":
    test_full_lifecycle(); test_other_sdlc_models(); test_no_domain_match_falls_back()
    print("ALL TESTS PASSED")

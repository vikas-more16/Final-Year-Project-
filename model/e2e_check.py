"""Pre-flight / end-to-end check against a RUNNING backend. Makes the same HTTP calls the React UI makes.

    1) start the server:   uvicorn app.main:app --port 8000
    2) in another terminal: python e2e_check.py [--url http://localhost:8000] [--model waterfall] [--with-report]

Prints PASS / FAIL / WARN per check and exits with code 1 if anything failed. Uses only the standard library.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:8000")
ap.add_argument("--model", default="waterfall", choices=["waterfall", "agile", "iterative"])
ap.add_argument("--with-report", action="store_true", help="also ask for a report (one extra LLM call)")
ARGS = ap.parse_args()
BASE = ARGS.url.rstrip("/")
FAILS = []

TEAM = [
    {"email": "leader@demo.com", "name": "Leader", "role": "Admin", "domains": ["business_analysis", "documentation"]},
    {"email": "front@demo.com", "name": "Frida", "role": "Team member", "domains": ["frontend", "ui_ux"]},
    {"email": "back@demo.com", "name": "Bala", "role": "Team member", "domains": ["backend", "database"]},
    {"email": "ml@demo.com", "name": "Maya", "role": "Team member", "domains": ["ai_ml", "backend"]},
    {"email": "qa@demo.com", "name": "Quinn", "role": "Team member", "domains": ["qa_testing", "devops"]},
]


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers={"Content-Type": "application/json"},
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}
    except urllib.error.URLError as e:
        print(f"Cannot reach the backend at {BASE} ({e.reason}). Is uvicorn running?")
        sys.exit(1)


def check(name, ok, detail=""):
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))
    if not ok:
        FAILS.append(name)
    return ok


def main():
    print(f"Backend: {BASE}   SDLC model: {ARGS.model}")
    code, h = call("GET", "/health")
    check("health endpoint", code == 200 and h.get("ok"), f"provider={h.get('llm_provider')}")
    if h.get("mock_mode"):
        print("  WARN  mock mode: outputs are templates, not from a real LLM")
    _, models = call("GET", "/sdlc-models")
    _, doms = call("GET", "/domains")
    check("SDLC models and domains load", len(models) >= 3 and len(doms) >= 8)

    code, p = call("POST", "/projects", {
        "name": "E2E Check Project", "description": "A web portal for managing student attendance and reports.",
        "objective": "Working MVP in 8 weeks", "tech_stack": "React, FastAPI, SQLite", "members": TEAM})
    pid = p.get("id")
    check("create project (201)", code == 201 and pid)

    code, _ = call("POST", f"/projects/{pid}/start-async", {"sdlc_model": ARGS.model, "requested_by": "front@demo.com"})
    check("non-leader cannot start (403)", code == 403)
    code, _ = call("POST", f"/projects/{pid}/start-async", {"sdlc_model": "banana", "requested_by": "leader@demo.com"})
    check("unknown SDLC model rejected (400)", code == 400)
    code, r = call("POST", f"/projects/{pid}/start-async", {"sdlc_model": ARGS.model, "requested_by": "leader@demo.com"})
    check("leader starts project (202)", code == 202, f"stage={r.get('stage')}")

    print("  ...orchestrator running (stages):", end=" ", flush=True)
    seen, t0 = [], time.time()
    while time.time() - t0 < 300:
        _, proj = call("GET", f"/projects/{pid}")
        if not seen or seen[-1] != proj["stage"]:
            seen.append(proj["stage"])
            print(proj["stage"], end=" ", flush=True)
        if proj["stage"] in ("done", "failed"):
            break
        time.sleep(1.5)
    print(f"({time.time() - t0:.0f}s)")
    check("kickoff finished", proj["stage"] == "done", proj.get("error", ""))
    if proj["stage"] != "done":
        return

    fb = [e for e in proj["events"] if e["kind"] == "fallback"]
    if fb:
        print(f"  WARN  {len(fb)} fallback event(s), output not fully from the LLM: " + "; ".join(e["message"][:90] for e in fb))
    tasks, phases = proj["tasks"], [ph["name"] for ph in proj["phases"]]
    check("requirements generated", len(proj["requirements"]) >= 5, f"{len(proj['requirements'])}")
    check("phases match the SDLC model", len(phases) >= 4, ", ".join(phases))
    check("tasks generated", len(tasks) >= len(phases), f"{len(tasks)}")
    check("every task allocated", all(t["assignee"] for t in tasks))
    check("first phase unlocked, later phases locked",
          all(t["status"] == "todo" for t in tasks if t["phase"] == phases[0])
          and all(t["status"] == "locked" for t in tasks if t["phase"] != phases[0]))
    by_email = {m["email"]: m for m in TEAM}
    bad = [t["id"] for t in tasks if t["domain"] in {d for m in TEAM for d in m["domains"]}
           and t["domain"] != "project_management" and t["domain"] not in by_email[t["assignee"]]["domains"]]
    check("tasks go to members with the matching domain", not bad, ", ".join(bad[:5]))
    check("every member has a project role", all(a["project_role"] for a in proj["assignments"]))
    check("monitoring and report present", proj["monitoring"].get("total_tasks") == len(tasks) and bool(proj["report"]))

    code, _ = call("PATCH", f"/projects/{pid}/tasks/{next(t['id'] for t in tasks if t['status'] == 'locked')}", {"status": "done"})
    check("locked task cannot be changed (400)", code == 400)

    for t in [t for t in tasks if t["phase"] == phases[0]]:
        call("PATCH", f"/projects/{pid}/tasks/{t['id']}", {"status": "in_progress", "actor": t["assignee"]})
        call("PATCH", f"/projects/{pid}/tasks/{t['id']}", {"status": "done", "actor": t["assignee"]})
    _, proj = call("GET", f"/projects/{pid}")
    check("phase advanced after all tasks done", proj["current_phase"] == phases[1], f"current={proj['current_phase']}")
    check("next phase tasks unlocked", all(t["status"] == "todo" for t in proj["tasks"] if t["phase"] == phases[1]))

    victim = next(t for t in proj["tasks"] if t["phase"] == phases[1])
    _, r = call("PATCH", f"/projects/{pid}/tasks/{victim['id']}", {"status": "blocked"})
    check("blocked task raises risk (at_risk)", r["monitoring"]["health"] == "at_risk")
    call("PATCH", f"/projects/{pid}/tasks/{victim['id']}", {"status": "todo"})

    _, r = call("POST", f"/projects/{pid}/chat", {"message": "how is the progress?"})
    check("chat: status", r.get("action") == "status")
    member = next(a for a in proj["assignments"] if a["email"] == "back@demo.com")
    _, r = call("POST", f"/projects/{pid}/chat", {"message": f"Bala is on leave, reassign his work"})
    check("chat: reallocate unavailable member", r.get("action") == "reallocate"
          and all(m["new_assignee"] != "back@demo.com" for m in r.get("moved", [])), f"moved {len(r.get('moved', []))} task(s)")
    if ARGS.with_report:
        _, r = call("POST", f"/projects/{pid}/chat", {"message": "give me a report"})
        check("chat: report", r.get("action") == "report" and len(r.get("report", "")) > 50)

    _, ev = call("GET", f"/projects/{pid}/events")
    kinds = {e["kind"] for e in ev}
    check("agent event log complete", {"sdlc_selected", "dispatch", "allocation", "phase_started", "phase_completed",
                                        "escalation", "reallocation"} <= kinds)
    print(f"\nProject id {pid}  (open GET {BASE}/projects/{pid} in Swagger)")


main()
print("\nRESULT:", "ALL CHECKS PASSED" if not FAILS else f"{len(FAILS)} FAILED: " + "; ".join(FAILS))
sys.exit(1 if FAILS else 0)

"""Seed YOUR real project, run the orchestrator and print a quality report.

    python seed_demo.py                    # waterfall
    python seed_demo.py --model agile      # or iterative

Uses the same .env as the server (real Gemini if LLM_PROVIDER=gemini) and saves the project into
the same database, so afterwards you can open it in Swagger:  GET /projects/{id}
Edit PROJECT and TEAM below (names/domains here are PLACEHOLDERS: set the real ones).
"""
import argparse
import collections
import sys
import time

from dotenv import load_dotenv

load_dotenv()
from app import store  # noqa: E402  (importing `app` also puts the repo root on sys.path)
from model import Member, Orchestrator, ProjectState, llm  # noqa: E402

PROJECT = dict(
    name="Multi-Agent Workflow Engine for Automated Project Management and Execution",
    description=("A web platform where a leader creates a project and an orchestrator agent coordinates specialised "
                 "AI agents (requirement analysis, planning, task allocation, monitoring, reporting) to automate "
                 "project planning, task assignment, progress tracking and report generation."),
    mission="Reduce manual project coordination by letting collaborating AI agents run routine project management work.",
    vision="AI-powered project management where planning, execution and monitoring are automated end to end.",
    objective=("Automate at least 80% of routine project management tasks and cut manual coordination time by 50%, "
               "evaluated on task accuracy, execution time, agent collaboration and user satisfaction."),
    tech_stack="React 19 + Vite frontend; Python FastAPI backend; SQLite; Google Gemini LLM; multi-agent orchestrator",
    documents=("Scope: multi-agent workflow engine; automated planning and task assignment; collaboration between "
               "specialised AI agents; progress monitoring and report generation; user-friendly interface; LLM-based "
               "decision making. Users: admin/leader creates organization, adds members with roles and creates "
               "projects; team members receive and update tasks. Applications: software companies, enterprises, "
               "agile teams, educational institutions, remote teams."),
)

TEAM = [  # EDIT: real emails and domains. Valid domains: see GET /domains
    dict(email="shruti@example.com", name="Shruti Mankar", role="Leader", domains=["business_analysis", "documentation"]),
    dict(email="vaishnavi@example.com", name="Vaishnavi Mankhair", role="Team member", domains=["frontend", "ui_ux"]),
    dict(email="vikas@example.com", name="Vikas More", role="Team member", domains=["backend", "database"]),
    dict(email="yash@example.com", name="Yash Mali", role="Team member", domains=["ai_ml", "backend"]),
    dict(email="sairaj@example.com", name="Sairaj Umbarkar", role="Team member", domains=["qa_testing", "devops"]),
]


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="waterfall", choices=["waterfall", "agile", "iterative"])
    args = ap.parse_args()

    state = ProjectState(**PROJECT, members=[Member(**m) for m in TEAM])
    t0 = time.time()
    try:
        Orchestrator().start_project(state, args.model)
    finally:
        store.save(state)
    secs = time.time() - t0

    print(f"\nProject id: {state.id}   model: {args.model}   LLM: {'MOCK' if llm.is_mock() else 'real'}   time: {secs:.0f}s")
    fb = [e for e in state.events if e.kind == "fallback"]
    if llm.is_mock():
        print("Mock mode: output is the built-in template, not from an LLM (set LLM_PROVIDER in .env)")
    else:
        print(f"Fallback events: {len(fb)}" + ("   <-- output is NOT fully from the LLM" if fb else "   (all output from the LLM)"))
    for e in fb:
        print("   -", e.sender, ":", e.message)

    print(f"\nREQUIREMENTS ({len(state.requirements)})")
    for r in state.requirements:
        print(f"  [{r.priority[:1].upper()}] {r.title}")

    names = {m.email: m.display() for m in state.members}
    for ph in state.phases:
        tasks = [t for t in state.tasks if t.phase == ph.name]
        print(f"\nPHASE {ph.name}  ({ph.start_date} -> {ph.end_date}, {ph.duration_days}d)  goal: {ph.goal}")
        for t in tasks:
            print(f"  {t.id} [{t.domain:<18}] {t.title[:62]:<62} {t.estimate_hours:>4g}h  -> {names.get(t.assignee, 'UNASSIGNED')}")

    print("\nWORKLOAD")
    for a in state.assignments:
        print(f"  {a['name']:<20} {a['project_role']:<34} {a['task_count']:>2} tasks  {a['open_hours']:>5g}h")

    warn = []
    titles = collections.Counter(t.title.lower() for t in state.tasks)
    warn += [f"duplicate task title: '{k}' x{v}" for k, v in titles.items() if v > 1]
    warn += [f"{t.id} has no matching domain in the team ({t.domain}): {t.title}" for t in state.tasks if t.allocation_note.startswith("No available")]
    warn += [f"phase '{p.name}' has fewer than 3 tasks" for p in state.phases if sum(t.phase == p.name for t in state.tasks) < 3]
    warn += [f"{a['name']} has no tasks" for a in state.assignments if a["task_count"] == 0]
    warn += [f"{t.id} is very large ({t.estimate_hours:g}h): {t.title}" for t in state.tasks if t.estimate_hours > 16]
    print("\nQUALITY WARNINGS" + ("" if warn else ": none"))
    for w in warn:
        print("  !", w)
    print(f"\nOpen in Swagger: GET /projects/{state.id}")


if __name__ == "__main__":
    main()

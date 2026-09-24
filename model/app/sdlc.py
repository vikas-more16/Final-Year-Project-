"""SDLC model + domain definitions.

The orchestrator is model-agnostic: to support a new SDLC model, add one entry to
SDLC_MODELS. No orchestrator code changes are needed.
"""

DOMAIN_LABELS = {
    "frontend": "Frontend Developer",
    "backend": "Backend Developer",
    "database": "Database Engineer",
    "ai_ml": "AI/ML Engineer",
    "devops": "DevOps Engineer",
    "qa_testing": "QA / Test Engineer",
    "ui_ux": "UI/UX Designer",
    "business_analysis": "Business Analyst",
    "documentation": "Technical Writer",
    "project_management": "Project Manager",
}

_ALIASES = {
    "front_end": "frontend", "back_end": "backend", "api": "backend", "server": "backend",
    "db": "database", "data": "database", "ml": "ai_ml", "ai": "ai_ml", "machine_learning": "ai_ml",
    "qa": "qa_testing", "testing": "qa_testing", "test": "qa_testing", "tester": "qa_testing",
    "ui": "ui_ux", "ux": "ui_ux", "design": "ui_ux", "ops": "devops", "deployment": "devops",
    "ba": "business_analysis", "analyst": "business_analysis", "docs": "documentation",
    "writer": "documentation", "pm": "project_management", "management": "project_management",
}


def normalize_domain(value) -> str:
    """Map free text ('Front-End', 'QA', ...) to one of DOMAIN_LABELS, else 'general'."""
    v = str(value or "").strip().lower().replace("-", "_").replace(" ", "_").replace("/", "_")
    if v in DOMAIN_LABELS:
        return v
    return _ALIASES.get(v, "general")


def _phase(name, goal, days, deliverables):
    return {"name": name, "goal": goal, "days": days, "deliverables": deliverables}


SDLC_MODELS = {
    "waterfall": {
        "label": "Waterfall",
        "description": "Strictly sequential phases. A phase starts only when the previous one is complete.",
        "phases": [
            _phase("Requirements", "Gather, analyse and document all requirements.", 7, ["SRS document"]),
            _phase("Design", "Design architecture, database and user interface.", 7,
                   ["System architecture", "Database schema", "UI wireframes"]),
            _phase("Implementation", "Build all modules according to the design.", 14, ["Working code for all modules"]),
            _phase("Testing", "Verify the system against the requirements.", 7, ["Test report"]),
            _phase("Deployment", "Release the system to users.", 3, ["Live system"]),
            _phase("Maintenance", "Fix issues and support users after release.", 7, ["Bug-fix releases", "User documentation"]),
        ],
    },
    "agile": {
        "label": "Agile (Scrum)",
        "description": "Short sprints that each deliver a working increment.",
        "phases": [
            _phase("Backlog & Sprint Planning", "Create and prioritise the product backlog.", 3, ["Product backlog"]),
            _phase("Sprint 1", "Deliver the first working increment.", 10, ["Increment 1"]),
            _phase("Sprint 2", "Deliver the second working increment.", 10, ["Increment 2"]),
            _phase("Sprint 3", "Deliver the third working increment.", 10, ["Increment 3"]),
            _phase("Release & Retrospective", "Release the product and review the process.", 4, ["Release", "Retrospective notes"]),
        ],
    },
    "iterative": {
        "label": "Iterative / Prototype",
        "description": "Start with a prototype and refine it over several iterations.",
        "phases": [
            _phase("Initial Prototype", "Build a quick prototype of the core idea.", 10, ["Prototype"]),
            _phase("Iteration 1", "Refine the prototype using feedback.", 10, ["Refined version 1"]),
            _phase("Iteration 2", "Add remaining features and polish.", 10, ["Refined version 2"]),
            _phase("Final Release", "Stabilise and release the product.", 5, ["Release"]),
        ],
    },
}

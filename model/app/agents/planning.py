from ..schemas import PhasePlan, PlanOutput, ProjectState
from ..sdlc import SDLC_MODELS
from .base import BaseAgent


class PlanningAgent(BaseAgent):
    name = "planning"
    description = "Creates a phase-wise plan that follows the SDLC model chosen by the leader."

    def run(self, state: ProjectState) -> None:
        spec = SDLC_MODELS[state.sdlc_model]["phases"]
        names = [p["name"] for p in spec]
        system = (
            "You are the Project Planning Agent in a multi-agent project management system. "
            f"Plan the project using EXACTLY these phases, in this order: {names}. "
            "For each phase give a goal, duration_days (integer) and deliverables. "
            "Rules: the goal is ONE sentence specific to this project; deliverables are concrete artefacts "
            "(documents, modules, reports), not activities; durations must suit a small student team, each "
            "phase between 3 and 21 days, and the whole plan should fit the project's objective. "
            'Respond with ONLY a JSON object: {"phases": [{"name": "...", "goal": "...", '
            '"duration_days": 7, "deliverables": ["..."]}]}'
        )
        user = state.brief() + "\n\nRequirements:\n" + "\n".join(f"- {r.title}" for r in state.requirements)
        out = self.ask_llm(state, system, user, lambda: self._mock(spec), PlanOutput)

        # The orchestrator owns the phase structure: force the LLM's plan onto the model's phases.
        by_name = {p.name.strip().lower(): p for p in out.phases}
        phases = []
        for i, s in enumerate(spec):
            p = by_name.get(s["name"].lower()) or (out.phases[i] if i < len(out.phases) else None)
            phases.append(PhasePlan(
                name=s["name"],
                goal=(p.goal if p and p.goal else s["goal"]),
                duration_days=max(1, p.duration_days) if p else s["days"],
                deliverables=(p.deliverables if p and p.deliverables else s["deliverables"])))
        state.phases = phases

    @staticmethod
    def _mock(spec) -> dict:
        return {"phases": [{"name": s["name"], "goal": s["goal"], "duration_days": s["days"],
                            "deliverables": s["deliverables"]} for s in spec]}

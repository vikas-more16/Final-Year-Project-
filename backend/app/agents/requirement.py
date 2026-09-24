from ..schemas import ProjectState, RequirementOutput
from .base import BaseAgent


class RequirementAgent(BaseAgent):
    name = "requirement"
    description = "Extracts functional and non-functional requirements from the project brief and documents."
    SYSTEM = (
        "You are the Requirement Analysis Agent in a multi-agent project management system. "
        "From the project information and documents, extract 6 to 12 clear, testable requirements. "
        'Respond with ONLY a JSON object, no markdown: {"requirements": [{"title": "...", '
        '"type": "functional|non_functional", "priority": "high|medium|low"}]}'
    )

    def run(self, state: ProjectState) -> None:
        out = self.ask_llm(state, self.SYSTEM, state.brief(), lambda: self._mock(state), RequirementOutput)
        state.requirements = out.requirements

    @staticmethod
    def _mock(state: ProjectState) -> dict:
        core = (state.description or state.name)[:90]
        return {"requirements": [
            {"title": f"Core functionality: {core}", "type": "functional", "priority": "high"},
            {"title": "User authentication and role-based access", "type": "functional", "priority": "high"},
            {"title": "Reliable storage and retrieval of project data", "type": "functional", "priority": "medium"},
            {"title": "Clear user interface for every user role", "type": "functional", "priority": "medium"},
            {"title": "Responds within 2 seconds under normal load", "type": "non_functional", "priority": "medium"},
            {"title": "User data is protected and access is audited", "type": "non_functional", "priority": "high"},
        ]}

"""Agent contract.

Every agent is a class with a `name` and `run(state)`. It reads the shared ProjectState,
does its job, and writes results back into the state. The Orchestrator is the only thing
that calls agents. If a teammate writes their own agent, it only has to follow this contract.
"""
from pydantic import ValidationError

from .. import llm
from ..schemas import ProjectState


class BaseAgent:
    name = "base"
    description = ""

    def run(self, state: ProjectState) -> None:
        raise NotImplementedError

    def ask_llm(self, state: ProjectState, system: str, user: str, mock, schema):
        """Call the LLM, validate the JSON against `schema`, fall back to `mock()` if unusable."""
        try:
            return schema.model_validate(llm.complete_json(system, user, mock))
        except (llm.LLMError, ValidationError) as e:
            state.log(self.name, "orchestrator", "fallback",
                      f"LLM output unusable ({type(e).__name__}: {str(e)[:150]}); used built-in fallback")
            return schema.model_validate(mock())

    def ask_text(self, state: ProjectState, system: str, user: str, mock) -> str:
        try:
            return llm.complete_text(system, user, mock)
        except llm.LLMError as e:
            state.log(self.name, "orchestrator", "fallback", f"LLM failed ({str(e)[:150]}); used built-in fallback")
            return mock()

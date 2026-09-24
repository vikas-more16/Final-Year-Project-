from .monitoring import MonitoringAgent
from .planning import PlanningAgent
from .reporting import ReportingAgent
from .requirement import RequirementAgent
from .task import TaskAgent


def build_agents() -> dict:
    """Agent registry. To plug in a teammate's agent, replace its entry here."""
    agents = [RequirementAgent(), PlanningAgent(), TaskAgent(), MonitoringAgent(), ReportingAgent()]
    return {a.name: a for a in agents}

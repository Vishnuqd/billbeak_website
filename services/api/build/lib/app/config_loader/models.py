"""In-memory representation of the composed configuration."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class JourneyConfig:
    key: str
    journey: dict[str, Any]
    flow: dict[str, Any]
    questions: dict[str, dict[str, Any]]
    timeline: dict[str, Any]
    crm: dict[str, Any]
    confirmation: dict[str, Any]
    emails: dict[str, Any]
    ordered_nodes: list[str] = field(default_factory=list)
    step_question_ids: list[str] = field(default_factory=list)

    @property
    def entry_node(self) -> str:
        return self.flow["entry"]

    @property
    def config_version(self) -> str:
        return str(self.journey.get("version", "0"))

    @property
    def journey_type(self) -> str | None:
        return self.journey.get("journeyType")

    def node(self, node_id: str) -> dict[str, Any] | None:
        return self.flow.get("nodes", {}).get(node_id)


@dataclass
class LoadedConfig:
    version: str
    manifest: dict[str, Any]
    intro: dict[str, Any]
    shared_questions: dict[str, dict[str, Any]]
    shared_field_sets: dict[str, dict[str, Any]]
    navigator: dict[str, Any]
    journeys: dict[str, JourneyConfig]

    def journey(self, key: str) -> JourneyConfig | None:
        return self.journeys.get(key)

    def get_question(self, journey_key: str, question_id: str) -> dict[str, Any] | None:
        jc = self.journeys.get(journey_key)
        if jc and question_id in jc.questions:
            return jc.questions[question_id]
        return self.shared_questions.get(question_id)

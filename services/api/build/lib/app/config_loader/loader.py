"""Production configuration loader.

Reads the frozen business configuration, composes journeys (uses/extends/
addFields), validates references and versions, projects each journey's step
chain, and caches the result. Fails fast (ConfigError) on any invalid config.

The loader is journey-agnostic: it discovers journeys from the manifest, so a
new journey folder is supported with no code change.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from ..config import get_settings
from ..errors import ConfigError
from .composer import compose_journey_questions, project_chain
from .models import JourneyConfig, LoadedConfig

_SIX_FILES = ("journey", "questions", "timeline", "crm", "confirmation", "emails")


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ConfigError(f"Missing configuration file: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise ConfigError(f"Invalid JSON in {path}: {exc}") from exc


class ConfigLoader:
    def __init__(self, config_dir: Path):
        self.config_dir = Path(config_dir)

    # -- public -----------------------------------------------------------
    def load(self) -> LoadedConfig:
        if not self.config_dir.exists():
            raise ConfigError(f"Configuration directory not found: {self.config_dir}")

        manifest = _read_json(self.config_dir / "manifest.json")
        version = str(manifest.get("version", "0"))

        intro = _read_json(self.config_dir / "_shared" / "intro.json")
        shared_raw = _read_json(self.config_dir / "_shared" / "questions.shared.json")
        shared_questions: dict[str, Any] = shared_raw.get("questions", {})
        shared_field_sets: dict[str, Any] = shared_raw.get("sharedFieldSets", {})
        navigator = manifest.get("navigator", {})

        journeys: dict[str, JourneyConfig] = {}
        for entry in manifest.get("journeys", []):
            key = entry["key"]
            directory = self.config_dir / entry["dir"]
            journeys[key] = self._load_journey(key, directory, shared_questions, shared_field_sets)

        loaded = LoadedConfig(
            version=version,
            manifest=manifest,
            intro=intro,
            shared_questions=shared_questions,
            shared_field_sets=shared_field_sets,
            navigator=navigator,
            journeys=journeys,
        )
        self._validate(loaded)
        return loaded

    # -- internals --------------------------------------------------------
    def _load_journey(
        self,
        key: str,
        directory: Path,
        shared_questions: dict[str, Any],
        shared_field_sets: dict[str, Any],
    ) -> JourneyConfig:
        if not directory.exists():
            raise ConfigError(f"Journey directory not found: {directory}")
        files = {name: _read_json(directory / f"{name}.json") for name in _SIX_FILES}

        q = files["questions"]
        flow = q.get("flow")
        if not flow or "entry" not in flow or "nodes" not in flow:
            raise ConfigError(f"{key}: questions.json missing a valid flow.")

        composed_questions = compose_journey_questions(
            key,
            q.get("questions", {}),
            q.get("uses", []),
            shared_questions,
            shared_field_sets,
        )
        ordered, step_qids = project_chain(flow)

        return JourneyConfig(
            key=key,
            journey=files["journey"],
            flow=flow,
            questions=composed_questions,
            timeline=files["timeline"],
            crm=files["crm"],
            confirmation=files["confirmation"],
            emails=files["emails"],
            ordered_nodes=ordered,
            step_question_ids=step_qids,
        )

    def _validate(self, loaded: LoadedConfig) -> None:
        # Root shared questions must exist.
        for required in ("sh_name", "sh_navigator", "sh_contact"):
            if required not in loaded.shared_questions:
                raise ConfigError(f"Shared question '{required}' is required but missing.")

        nav_branches = loaded.navigator.get("branches", {})
        for value, branch in nav_branches.items():
            jkey = branch.get("journey")
            if jkey not in loaded.journeys:
                raise ConfigError(f"navigator branch '{value}' -> unknown journey '{jkey}'.")
            entry = branch.get("entry")
            if loaded.journeys[jkey].node(entry) is None:
                raise ConfigError(
                    f"navigator branch '{value}' entry '{entry}' not found in journey '{jkey}'."
                )

        for key, jc in loaded.journeys.items():
            if "version" not in jc.journey:
                raise ConfigError(f"{key}: journey.json missing 'version'.")
            nodes = jc.flow.get("nodes", {})
            entry = jc.flow.get("entry")
            entry_node = nodes.get(entry)
            if entry_node is None or entry_node.get("kind") != "question":
                raise ConfigError(f"{key}: flow entry must be an existing question node.")
            for node_id, node in nodes.items():
                if node.get("id") != node_id:
                    raise ConfigError(f"{key}: node key '{node_id}' != node id '{node.get('id')}'.")
                if node.get("kind") == "question":
                    qid = node.get("questionId")
                    if loaded.get_question(key, qid) is None:
                        raise ConfigError(
                            f"{key}: node '{node_id}' references unknown question '{qid}'."
                        )
                    if not node.get("transitions"):
                        raise ConfigError(f"{key}: question node '{node_id}' has no transitions.")
                    for t in node.get("transitions", []):
                        if t.get("to") not in nodes:
                            raise ConfigError(
                                f"{key}: node '{node_id}' transitions to unknown node '{t.get('to')}'."
                            )


# ---------------------------------------------------------------------------
# Process-wide cache (thread-safe, fail-fast).
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_cache: LoadedConfig | None = None


def load_config(config_dir: Path | None = None) -> LoadedConfig:
    directory = config_dir or get_settings().config_dir
    return ConfigLoader(directory).load()


def get_config(*, force_reload: bool = False) -> LoadedConfig:
    global _cache
    with _lock:
        if _cache is None or force_reload:
            _cache = load_config()
        return _cache

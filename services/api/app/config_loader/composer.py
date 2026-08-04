"""Composition: resolves `uses`, `extends` and `addFields` per the documented
loader contract (config/conversations/README.md → Composition / loader contract).
"""

from __future__ import annotations

import copy
from typing import Any, TYPE_CHECKING

from ..errors import ConfigError

if TYPE_CHECKING:
    from .models import LoadedConfig


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for key, value in override.items():
        if key in out and isinstance(out[key], dict) and isinstance(value, dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def _resolve_add_fields(
    entries: list[Any], shared_field_sets: dict[str, dict[str, Any]], where: str
) -> list[dict[str, Any]]:
    resolved: list[dict[str, Any]] = []
    for entry in entries:
        if isinstance(entry, str):
            if entry.startswith("sharedFieldSets."):
                name = entry.split(".", 1)[1]
                if name not in shared_field_sets:
                    raise ConfigError(f"{where}: unknown shared field set '{name}'.")
                resolved.append(copy.deepcopy(shared_field_sets[name]))
            else:
                raise ConfigError(f"{where}: unresolvable addFields ref '{entry}'.")
        elif isinstance(entry, dict):
            resolved.append(copy.deepcopy(entry))
        else:
            raise ConfigError(f"{where}: invalid addFields entry.")
    return resolved


def resolve_question(
    qid: str,
    raw: dict[str, Any],
    shared_questions: dict[str, dict[str, Any]],
    shared_field_sets: dict[str, dict[str, Any]],
    journey_key: str,
) -> dict[str, Any]:
    """Resolve a single question definition, applying `extends` if present."""
    if "extends" not in raw:
        return copy.deepcopy(raw)

    base_id = raw["extends"]
    if base_id not in shared_questions:
        raise ConfigError(f"{journey_key}.{qid}: extends unknown shared question '{base_id}'.")

    resolved = copy.deepcopy(shared_questions[base_id])
    resolved["id"] = qid

    overrides = raw.get("overrides", {})
    add_fields = overrides.get("config", {}).get("addFields", []) if overrides else []
    resolved = _deep_merge(resolved, overrides)

    # addFields append to base config.fields; strip the directive itself.
    resolved.setdefault("config", {})
    resolved["config"].pop("addFields", None)
    if add_fields:
        base_fields = list(resolved["config"].get("fields", []))
        base_fields.extend(
            _resolve_add_fields(add_fields, shared_field_sets, f"{journey_key}.{qid}")
        )
        resolved["config"]["fields"] = base_fields

    resolved.pop("extends", None)
    resolved.pop("overrides", None)
    return resolved


def compose_journey_questions(
    journey_key: str,
    raw_questions: dict[str, dict[str, Any]],
    uses: list[str],
    shared_questions: dict[str, dict[str, Any]],
    shared_field_sets: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Compose a journey's full question set: its own + `uses` refs + resolved `extends`."""
    composed: dict[str, dict[str, Any]] = {}

    for uid in uses:
        if uid not in shared_questions:
            raise ConfigError(f"{journey_key}: `uses` references unknown shared question '{uid}'.")
        composed[uid] = copy.deepcopy(shared_questions[uid])

    for qid, raw in raw_questions.items():
        composed[qid] = resolve_question(
            qid, raw, shared_questions, shared_field_sets, journey_key
        )

    return composed


def project_chain(flow: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Follow default transitions entry->terminal. Returns (all node ids, question node ids)."""
    nodes = flow.get("nodes", {})
    ordered: list[str] = []
    question_ids: list[str] = []
    seen: set[str] = set()
    cursor: str | None = flow.get("entry")

    while cursor and cursor not in seen:
        seen.add(cursor)
        ordered.append(cursor)
        node = nodes.get(cursor)
        if node is None or node.get("kind") == "terminal":
            break
        if node.get("kind") == "question":
            question_ids.append(node.get("questionId"))
        transitions = node.get("transitions", [])
        # Projected default: last transition without a `when`, else the first.
        default = next((t for t in transitions if t.get("when") is None), None)
        cursor = (default or (transitions[0] if transitions else {})).get("to")

    return ordered, question_ids


def build_master_flow(loaded: "LoadedConfig") -> tuple[dict[str, Any], dict[str, Any]]:
    """Stitch root (name -> navigator branch) + every journey into one flow bundle.

    This is what the frontend engine loads for the whole conversation. Returns
    (flow, questions).
    """
    branches = loaded.navigator.get("branches", {})
    nav_transitions: list[dict[str, Any]] = []
    default_to: str | None = None
    for value, branch in branches.items():
        entry = branch.get("entry")
        if value == "something_else":
            default_to = entry
            continue
        nav_transitions.append({"to": entry, "when": {"op": "eq", "path": "sh_navigator", "value": value}})
    if default_to:
        nav_transitions.append({"to": default_to})

    nodes: dict[str, Any] = {
        "sh_name": {"id": "sh_name", "kind": "question", "questionId": "sh_name", "transitions": [{"to": "sh_navigator"}]},
        "sh_navigator": {"id": "sh_navigator", "kind": "question", "questionId": "sh_navigator", "transitions": nav_transitions},
    }
    questions: dict[str, Any] = dict(loaded.shared_questions)
    for jc in loaded.journeys.values():
        nodes.update(copy.deepcopy(jc.flow.get("nodes", {})))
        questions.update(jc.questions)

    flow = {"id": "lets_talk", "version": 1, "entry": "sh_name", "nodes": nodes}
    return flow, questions

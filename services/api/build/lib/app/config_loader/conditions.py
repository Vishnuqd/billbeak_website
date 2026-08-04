"""Declarative condition evaluation and next-node resolution.

Mirrors the engine's semantics (packages/conversation-engine/src/conditions)
so the backend reaches the same branching decisions as the frontend — but the
backend is authoritative.
"""

from __future__ import annotations

from typing import Any

AnswerMap = dict[str, Any]


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def _to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip() != "":
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _scalar_eq(value: Any, target: Any) -> bool:
    if isinstance(value, (str, int, float, bool)):
        return value == target
    return False


def evaluate_condition(condition: dict[str, Any] | None, answers: AnswerMap) -> bool:
    if condition is None:
        return True
    op = condition.get("op")
    if op == "always":
        return True
    if op == "never":
        return False

    path = condition.get("path")
    value = answers.get(path) if path is not None else None

    if op == "exists":
        return value is not None and not _is_empty(value)
    if op == "empty":
        return _is_empty(value)
    if op == "eq":
        return _scalar_eq(value, condition.get("value"))
    if op == "neq":
        return not _scalar_eq(value, condition.get("value"))
    if op == "in":
        return any(_scalar_eq(value, c) for c in condition.get("value", []))
    if op == "nin":
        return not any(_scalar_eq(value, c) for c in condition.get("value", []))
    if op == "includes":
        return isinstance(value, list) and condition.get("value") in value
    if op in {"gt", "gte", "lt", "lte"}:
        n = _to_number(value)
        target = condition.get("value")
        if n is None or not isinstance(target, (int, float)):
            return False
        return {
            "gt": n > target,
            "gte": n >= target,
            "lt": n < target,
            "lte": n <= target,
        }[op]
    if op == "and":
        return all(evaluate_condition(c, answers) for c in condition.get("conditions", []))
    if op == "or":
        return any(evaluate_condition(c, answers) for c in condition.get("conditions", []))
    if op == "not":
        return not evaluate_condition(condition.get("condition"), answers)
    return False


def resolve_next_node(node: dict[str, Any], answers: AnswerMap) -> str | None:
    """First transition whose `when` passes (absent `when` = default)."""
    for transition in node.get("transitions", []):
        if evaluate_condition(transition.get("when"), answers):
            return transition.get("to")
    return None

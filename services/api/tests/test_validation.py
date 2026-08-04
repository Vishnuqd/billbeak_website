"""Server-side validation + condition tests. No database."""

from __future__ import annotations

from app.config_loader.conditions import evaluate_condition, resolve_next_node
from app.config_loader.validation import validate_answer


def test_required_text():
    q = {"type": "text", "optional": False}
    assert validate_answer(q, "") != []
    assert validate_answer(q, "hello") == []


def test_optional_text():
    q = {"type": "text", "optional": True}
    assert validate_answer(q, "") == []


def test_email_type_default_validator():
    q = {"type": "email", "optional": False}
    assert validate_answer(q, "nope") != []
    assert validate_answer(q, "a@b.co") == []


def test_multi_min_selected():
    q = {"type": "multi_choice", "optional": False, "validations": [{"rule": "minSelected", "params": {"value": 1}}]}
    assert validate_answer(q, []) != []
    assert validate_answer(q, ["x"]) == []


def test_group_require_at_least():
    q = {
        "type": "group",
        "config": {
            "requireAtLeast": {"fields": ["linkedin", "cv"], "count": 1, "message": "one needed"},
            "fields": [
                {"name": "linkedin", "type": "url", "validators": [{"rule": "url"}]},
                {"name": "cv", "type": "file"},
                {"name": "portfolio", "type": "url", "validators": [{"rule": "url"}]},
            ],
        },
    }
    assert validate_answer(q, {}) != []  # neither provided
    assert validate_answer(q, {"linkedin": "https://linkedin.com/in/x"}) == []
    # invalid url still flagged
    assert validate_answer(q, {"linkedin": "not-a-url"}) != []


def test_group_consent_required():
    q = {"type": "group", "config": {"fields": [{"name": "consent", "type": "consent", "required": True}]}}
    assert validate_answer(q, {"consent": False}) != []
    assert validate_answer(q, {"consent": True}) == []


def test_conditions_eq_in_numeric():
    answers = {"role": "employer", "days": "10", "tags": ["a", "b"]}
    assert evaluate_condition({"op": "eq", "path": "role", "value": "employer"}, answers)
    assert evaluate_condition({"op": "in", "path": "role", "value": ["employer", "x"]}, answers)
    assert evaluate_condition({"op": "gt", "path": "days", "value": 7}, answers)
    assert evaluate_condition({"op": "includes", "path": "tags", "value": "a"}, answers)
    assert not evaluate_condition({"op": "eq", "path": "role", "value": "student"}, answers)


def test_resolve_next_first_match():
    node = {
        "transitions": [
            {"to": "a", "when": {"op": "eq", "path": "x", "value": "1"}},
            {"to": "b"},
        ]
    }
    assert resolve_next_node(node, {"x": "1"}) == "a"
    assert resolve_next_node(node, {"x": "2"}) == "b"

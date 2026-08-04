"""Server-side answer validation. The backend is the source of truth; it never
trusts the frontend. Mirrors the engine's built-in validators plus the `group`
composite type (contact/org/profile/chips+text) declared in the configuration.
"""

from __future__ import annotations

import re
from typing import Any

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
URL_RE = re.compile(r"^https?://[^\s.]+\.[^\s]{2,}$", re.IGNORECASE)
PHONE_RE = re.compile(r"^\+?[0-9][0-9\s\-()]{6,}$")

FieldError = dict[str, str]


def _is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def _length(value: Any) -> int | None:
    if isinstance(value, (str, list)):
        return len(value)
    return None


def _num(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _run_rule(rule: str, value: Any, params: dict[str, Any]) -> bool:
    p = params or {}
    if rule == "required":
        return not _is_empty(value)
    if rule in {"minLength", "maxLength"}:
        if _is_empty(value) and rule == "minLength":
            return True
        length = _length(value)
        target = p.get("value")
        if length is None or not isinstance(target, (int, float)):
            return rule == "maxLength"
        return length >= target if rule == "minLength" else length <= target
    if rule in {"min", "max"}:
        if _is_empty(value):
            return True
        n = _num(value)
        target = p.get("value")
        if n is None or not isinstance(target, (int, float)):
            return False
        return n >= target if rule == "min" else n <= target
    if rule in {"minSelected", "maxSelected"}:
        target = p.get("value")
        count = len(value) if isinstance(value, list) else 0
        if not isinstance(target, (int, float)):
            return rule == "maxSelected"
        return count >= target if rule == "minSelected" else count <= target
    if rule == "pattern":
        if _is_empty(value) or not isinstance(value, str):
            return _is_empty(value)
        raw = p.get("value")
        return isinstance(raw, str) and re.search(raw, value) is not None
    if rule == "email":
        return _is_empty(value) or (isinstance(value, str) and bool(EMAIL_RE.match(value.strip())))
    if rule == "url":
        return _is_empty(value) or (isinstance(value, str) and bool(URL_RE.match(value.strip())))
    if rule == "phone":
        return _is_empty(value) or (isinstance(value, str) and bool(PHONE_RE.match(value.strip())))
    # Unknown rules pass (config is validated separately for known rules).
    return True


_DEFAULT_TYPE_RULES = {
    "email": [{"rule": "email"}],
    "website": [{"rule": "url"}],
    "linkedin": [{"rule": "url"}],
    "phone": [{"rule": "phone"}],
}

_DEFAULT_MESSAGES = {
    "required": "This field is required.",
    "email": "Enter a valid email address.",
    "url": "Enter a valid URL.",
    "phone": "Enter a valid phone number.",
    "minLength": "Too short.",
    "maxLength": "Too long.",
    "min": "Value is too small.",
    "max": "Value is too large.",
    "minSelected": "Please select more options.",
    "maxSelected": "Please select fewer options.",
    "pattern": "Invalid format.",
}


def _effective_rules(question: dict[str, Any]) -> list[dict[str, Any]]:
    rules: list[dict[str, Any]] = []
    if not question.get("optional", False) and question.get("type") != "group":
        rules.append({"rule": "required"})
    rules.extend(_DEFAULT_TYPE_RULES.get(question.get("type", ""), []))
    rules.extend(question.get("validations", []) or [])
    return rules


def _validate_scalar(question: dict[str, Any], value: Any, field: str | None = None) -> list[FieldError]:
    errors: list[FieldError] = []
    for ref in _effective_rules(question):
        rule = ref["rule"]
        if not _run_rule(rule, value, ref.get("params", {})):
            err: FieldError = {
                "rule": rule,
                "message": ref.get("message") or _DEFAULT_MESSAGES.get(rule, f"Failed {rule}."),
            }
            if field:
                err["field"] = field
            errors.append(err)
    return errors


def _validate_group(question: dict[str, Any], value: Any) -> list[FieldError]:
    errors: list[FieldError] = []
    config = question.get("config", {}) or {}
    fields = config.get("fields", [])
    data = value if isinstance(value, dict) else {}

    for f in fields:
        name = f.get("name")
        fval = data.get(name)
        # A field acts like a small question definition.
        sub = {
            "type": f.get("type", "text"),
            "optional": not f.get("required", False),
            "validations": f.get("validators", []),
        }
        # 'consent' fields must be truthy when required.
        if f.get("type") == "consent":
            if f.get("required", False) and not bool(fval):
                errors.append({"field": name, "rule": "required", "message": "Consent is required."})
            continue
        errors.extend(_validate_scalar(sub, fval, field=name))

    require = config.get("requireAtLeast")
    if isinstance(require, dict):
        wanted = require.get("fields", [])
        count = require.get("count", 1)
        present = sum(1 for n in wanted if not _is_empty(data.get(n)))
        if present < count:
            errors.append(
                {
                    "rule": "requireAtLeast",
                    "message": require.get("message", "Provide at least one required field."),
                    "field": ",".join(wanted),
                }
            )
    return errors


def validate_answer(question: dict[str, Any], value: Any) -> list[FieldError]:
    """Return a list of field errors (empty == valid)."""
    if question.get("type") == "group":
        return _validate_group(question, value)
    return _validate_scalar(question, value)

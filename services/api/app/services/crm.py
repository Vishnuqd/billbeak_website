"""CRM adapter abstraction + payload/lead-score generation from crm.json.

The payload is real and derived from configuration. A pluggable `CRMAdapter`
covers future HubSpot/Salesforce/Zoho; the default (`none`) just records the
payload as pending. No vendor-specific logic in the business layer.
"""

from __future__ import annotations

from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from ..config_loader.models import JourneyConfig
from ..models import CRMEvent, Journey


class CRMAdapter(Protocol):
    name: str

    def push(self, event: CRMEvent) -> str:  # returns status
        ...


class NoopCRMAdapter:
    name = "none"

    def push(self, event: CRMEvent) -> str:
        return "pending"  # stored locally; no external system configured


def get_crm_adapter(provider: str) -> CRMAdapter:
    # Future: hubspot / salesforce / zoho adapters plug in here.
    return NoopCRMAdapter()


def _score_input(inp: dict[str, Any], signals: dict[str, Any]) -> float:
    value = signals.get(inp.get("signal"))
    itype = inp.get("type")

    if "weights" in inp and itype is None:
        weights = inp["weights"]
        if isinstance(value, (str, int, float, bool)):
            return float(weights.get(value, 0))
        return 0.0
    if itype == "presence":
        present = value not in (None, "", [], {}) and value is not False
        return float(inp.get("weight", 0)) if present else 0.0
    if itype == "count":
        n = len(value) if isinstance(value, list) else 0
        return float(min(n * inp.get("perItem", 0), inp.get("cap", n * inp.get("perItem", 0))))
    if itype == "includesAny":
        if isinstance(value, list) and any(v in value for v in inp.get("values", [])):
            return float(inp.get("weight", 0))
        return 0.0
    if itype == "length":
        length = len(value) if isinstance(value, str) else 0
        best = 0.0
        for th in sorted(inp.get("thresholds", []), key=lambda t: t.get("min", 0), reverse=True):
            if length >= th.get("min", 0):
                best = float(th.get("score", 0))
                break
        return best
    return 0.0


def compute_lead_score(crm_cfg: dict[str, Any], signals: dict[str, Any]) -> int:
    ls = crm_cfg.get("leadScore", {})
    total = sum(_score_input(inp, signals) for inp in ls.get("inputs", []))
    cap = ls.get("max")
    if isinstance(cap, (int, float)):
        total = min(total, cap)
    return int(round(total))


def build_payload(
    jc: JourneyConfig, context: dict[str, Any], signals: dict[str, Any], lead_score: int
) -> dict[str, Any]:
    crm = jc.crm
    return {
        "journeyKey": jc.key,
        "pipeline": crm.get("pipeline"),
        "ownerTeam": crm.get("ownerTeam"),
        "priorityBase": crm.get("priorityBase"),
        "lifecycleStage": crm.get("lifecycleStage"),
        "tags": crm.get("tags", []),
        "leadScore": lead_score,
        "journeyStage": signals.get(crm.get("journeyStageField")) if crm.get("journeyStageField") else None,
        "routing": crm.get("routing", []),
        "contact": {
            "firstName": context.get("firstName"),
            "email": context.get("email"),
            "phone": context.get("phone"),
            "organisationName": context.get("organisationName"),
            "preferredContact": context.get("preferredContact"),
        },
        "signals": signals,
    }


async def generate_crm_event(
    session: AsyncSession,
    journey: Journey,
    jc: JourneyConfig,
    context: dict[str, Any],
    signals: dict[str, Any],
    adapter: CRMAdapter,
) -> CRMEvent:
    lead_score = compute_lead_score(jc.crm, signals)
    payload = build_payload(jc, context, signals, lead_score)
    event = CRMEvent(
        journey_id=journey.id,
        pipeline=jc.crm.get("pipeline"),
        owner_team=jc.crm.get("ownerTeam"),
        lead_score=lead_score,
        provider=adapter.name,
        payload=payload,
    )
    session.add(event)
    await session.flush()
    event.status = adapter.push(event)
    return event

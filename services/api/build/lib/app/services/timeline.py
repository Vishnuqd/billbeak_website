"""Timeline (moat) event emission. Generic: event definitions come from each
journey's timeline.json; the backend simply persists them."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..config_loader.models import JourneyConfig
from ..db import utcnow
from ..models import Journey, TimelineEvent


async def emit_event(
    session: AsyncSession,
    journey: Journey,
    *,
    type: str,
    label: str,
    evidence: dict[str, Any] | None = None,
    verification: str = "system",
    visibility: str = "private",
    source: str | None = None,
    occurred_at: datetime | None = None,
) -> TimelineEvent:
    event = TimelineEvent(
        journey_id=journey.id,
        person_id=journey.person_id,
        type=type,
        label=label,
        evidence=evidence,
        verification_status=verification,
        visibility=visibility,
        source=source,
        occurred_at=occurred_at or utcnow(),
    )
    session.add(event)
    return event


def find_event_def(jc: JourneyConfig, *, trigger: str) -> dict[str, Any] | None:
    """Return the first timeline event definition matching a trigger."""
    for ev in jc.timeline.get("events", []):
        if ev.get("trigger") == trigger:
            return ev
    return None


async def emit_config_event(
    session: AsyncSession,
    journey: Journey,
    jc: JourneyConfig,
    *,
    trigger: str,
    evidence: dict[str, Any] | None = None,
) -> TimelineEvent | None:
    ev = find_event_def(jc, trigger=trigger)
    if ev is None:
        return None
    return await emit_event(
        session,
        journey,
        type=ev["type"],
        label=ev.get("label", ev["type"]),
        evidence=evidence,
        verification=ev.get("verification", "system"),
        visibility=ev.get("visibility", "private"),
        source="config",
    )

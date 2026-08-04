"""Email queue abstraction.

The queue itself is real persistence (EmailQueue rows). A pluggable `EmailSender`
covers future providers; the default logs and never calls an external API. No
provider-specific logic lives in the business layer.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from ..config_loader.models import JourneyConfig
from ..db import utcnow
from ..models import EmailQueue, Journey

logger = logging.getLogger("billbeak.email")


class EmailSender(Protocol):
    name: str

    def send(self, message: EmailQueue) -> str:  # returns delivery status
        ...


class LogEmailSender:
    name = "log"

    def send(self, message: EmailQueue) -> str:
        logger.info("email queued id=%s to=%s subject=%s", message.message_id, message.recipient, message.subject)
        return "queued"


def get_email_sender(provider: str) -> EmailSender:
    # Only the log sender exists in this phase; real providers plug in here.
    return LogEmailSender()


def interpolate(template: str, context: dict[str, Any]) -> str:
    out = template
    for key, value in context.items():
        token = "{" + key + "}"
        if token in out:
            out = out.replace(token, "" if value is None else str(value))
    return out


def _resolve_recipient(rule: str, context: dict[str, Any]) -> str | None:
    if rule == "visitor:email":
        return context.get("email")
    if rule == "owner":
        return "owner@billbeak.internal"
    if rule.startswith("team:"):
        return f"{rule.split(':', 1)[1]}@teams.billbeak.internal"
    return None


async def queue_emails(
    session: AsyncSession,
    journey: Journey,
    jc: JourneyConfig,
    context: dict[str, Any],
) -> list[EmailQueue]:
    """Create queued EmailQueue rows from the journey's emails.json."""
    now = utcnow()
    created: list[EmailQueue] = []
    for msg in jc.emails.get("messages", []):
        variables = {v: context.get(v) for v in msg.get("variables", [])}
        row = EmailQueue(
            journey_id=journey.id,
            message_id=msg["id"],
            type=msg.get("type", "visitor"),
            recipient=_resolve_recipient(msg.get("recipientRule", ""), context),
            subject=interpolate(msg.get("subject", ""), context),
            variables=variables,
            status="queued",
            scheduled_at=now + timedelta(minutes=msg.get("delayMinutes", 0)),
        )
        session.add(row)
        created.append(row)
    return created

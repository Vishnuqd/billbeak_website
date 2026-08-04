"""Journey orchestration — the backend's source-of-truth business logic.

Everything is driven by the loaded configuration. There is no journey-specific
branching in this module; it interprets whatever the config declares.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..config_loader import get_config
from ..config_loader.conditions import resolve_next_node
from ..config_loader.models import JourneyConfig
from ..config_loader.validation import validate_answer
from ..db import utcnow
from ..errors import BadRequestError, ConflictError, NotFoundError, ValidationError
from ..models import (
    Answer,
    CRMEvent,
    EmailQueue,
    Interaction,
    Journey,
    JourneyMetadata,
    Upload,
)
from ..services.uploads import StoredObject
from . import crm as crm_service
from . import email as email_service
from . import timeline as timeline_service


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _require_journey_config(journey_key: str) -> JourneyConfig:
    jc = get_config().journey(journey_key)
    if jc is None:
        raise NotFoundError(f"Unknown journey '{journey_key}'.")
    return jc


async def _current_answer_map(session: AsyncSession, journey: Journey) -> dict[str, Any]:
    rows = (
        await session.execute(
            select(Answer).where(
                Answer.journey_id == journey.id,
                Answer.is_current.is_(True),
                Answer.validation_state == "valid",
            )
        )
    ).scalars().all()
    return {r.question_id: r.value.get("value") if isinstance(r.value, dict) else r.value for r in rows}


def _completion(jc: JourneyConfig, answer_map: dict[str, Any]) -> tuple[int, float]:
    total = max(len(jc.step_question_ids), 1)
    answered = sum(1 for qid in jc.step_question_ids if qid in answer_map)
    return answered, round(answered / total * 100, 2)


def _resolve_values(jc: JourneyConfig, answer_map: dict[str, Any]) -> dict[str, Any]:
    """Flatten answers into a lookup keyed by question id, persistAs and captured tokens."""
    resolved: dict[str, Any] = {}
    for qid, question in jc.questions.items():
        value = answer_map.get(qid)
        config = question.get("config", {}) or {}
        if question.get("type") == "group" and isinstance(value, dict):
            for field in config.get("fields", []):
                fname = field.get("name")
                fval = value.get(fname)
                resolved[fname] = fval
                if field.get("persistAs"):
                    resolved[field["persistAs"]] = fval
        else:
            resolved[qid] = value
            if config.get("persistAs"):
                resolved[config["persistAs"]] = value
            if config.get("capturesToken"):
                resolved[config["capturesToken"]] = value
    return resolved


# ---------------------------------------------------------------------------
# create / read
# ---------------------------------------------------------------------------

async def create_journey(
    session: AsyncSession, *, journey_key: str, lead_source: str | None
) -> tuple[Journey, JourneyConfig]:
    jc = _require_journey_config(journey_key)
    now = utcnow()
    journey = Journey(
        journey_key=journey_key,
        journey_type=jc.journey_type,
        flow_version=jc.flow.get("version", 1),
        config_version=jc.config_version,
        status="in_progress",
        current_node_id=jc.entry_node,
        current_step=0,
        total_steps=len(jc.step_question_ids),
        completion_pct=0.0,
        lead_source=lead_source,
        started_at=now,
    )
    session.add(journey)
    await session.flush()

    session.add(Interaction(journey_id=journey.id, type="system", payload={"event": "created"}))
    await timeline_service.emit_config_event(
        session, journey, jc, trigger="engine:conversation_started"
    )
    return journey, jc


async def get_journey(session: AsyncSession, journey_id: str) -> Journey:
    journey = await session.get(Journey, journey_id)
    if journey is None or journey.deleted_at is not None:
        raise NotFoundError(f"Journey '{journey_id}' not found.")
    return journey


# ---------------------------------------------------------------------------
# answer
# ---------------------------------------------------------------------------

async def submit_answer(
    session: AsyncSession, journey: Journey, *, question_id: str, value: Any
) -> dict[str, Any]:
    if journey.status == "completed":
        raise ConflictError("Journey already completed.")
    jc = _require_journey_config(journey.journey_key)
    question = get_config().get_question(journey.journey_key, question_id)
    if question is None:
        raise BadRequestError(f"Unknown question '{question_id}' for journey '{journey.journey_key}'.")

    errors = validate_answer(question, value)
    if errors:
        raise ValidationError("Answer failed validation.", details=errors)

    # Append-only: supersede any prior current answer for this question.
    await session.execute(
        update(Answer)
        .where(Answer.journey_id == journey.id, Answer.question_id == question_id, Answer.is_current.is_(True))
        .values(is_current=False)
    )
    session.add(
        Answer(
            journey_id=journey.id,
            question_id=question_id,
            value={"value": value},
            validation_state="valid",
            is_current=True,
        )
    )
    session.add(
        Interaction(journey_id=journey.id, type="answer", payload={"questionId": question_id})
    )
    await timeline_service.emit_event(
        session,
        journey,
        type="question_answered",
        label=f"Answered {question_id}",
        evidence={"questionId": question_id},
        source="engine",
    )
    await session.flush()

    # Advance the flow if this answered the current node.
    answer_map = await _current_answer_map(session, journey)
    node = jc.node(journey.current_node_id) if journey.current_node_id else None
    if node and node.get("questionId") == question_id:
        nxt = resolve_next_node(node, answer_map)
        if nxt:
            journey.current_node_id = nxt

    answered, pct = _completion(jc, answer_map)
    journey.current_step = answered
    journey.completion_pct = pct
    await session.flush()

    return {
        "journeyId": journey.id,
        "currentNodeId": journey.current_node_id,
        "completionPct": journey.completion_pct,
        "status": journey.status,
    }


# ---------------------------------------------------------------------------
# uploads
# ---------------------------------------------------------------------------

async def register_upload(
    session: AsyncSession,
    journey: Journey,
    *,
    question_id: str | None,
    filename: str,
    content_type: str,
    stored: StoredObject,
) -> Upload:
    if journey.status == "completed":
        raise ConflictError("Journey already completed.")
    upload = Upload(
        journey_id=journey.id,
        question_id=question_id,
        provider=stored.provider,
        object_key=stored.object_key,
        filename=filename,
        content_type=content_type,
        size_bytes=stored.size_bytes,
        sha256=stored.sha256,
        scan_status="pending",
        url=stored.url,
    )
    session.add(upload)
    await session.flush()

    session.add(
        Interaction(journey_id=journey.id, type="upload", ref_id=upload.id, payload={"questionId": question_id})
    )
    await timeline_service.emit_event(
        session,
        journey,
        type="upload_completed",
        label="Upload Completed",
        evidence={"uploadId": str(upload.id), "filename": filename},
        source="engine",
    )

    # For a top-level `file` question, record an answer so it counts as answered.
    # For group file-fields the client submits the group answer with the reference.
    question = get_config().get_question(journey.journey_key, question_id) if question_id else None
    if question_id and question and question.get("type") == "file":
        await session.execute(
            update(Answer)
            .where(Answer.journey_id == journey.id, Answer.question_id == question_id, Answer.is_current.is_(True))
            .values(is_current=False)
        )
        session.add(
            Answer(
                journey_id=journey.id,
                question_id=question_id,
                value={"value": {"uploadId": str(upload.id), "filename": filename}},
                validation_state="valid",
                is_current=True,
            )
        )
    await session.flush()
    return upload


# ---------------------------------------------------------------------------
# complete
# ---------------------------------------------------------------------------

async def complete_journey(session: AsyncSession, journey: Journey) -> dict[str, Any]:
    if journey.status == "completed":
        raise ConflictError("Journey already completed.")
    jc = _require_journey_config(journey.journey_key)
    answer_map = await _current_answer_map(session, journey)

    # Backend is source of truth: required step questions must be present & valid.
    missing: list[dict[str, str]] = []
    for qid in jc.step_question_ids:
        question = get_config().get_question(journey.journey_key, qid)
        if question is None:
            continue
        if question.get("optional", False):
            continue
        if qid not in answer_map:
            missing.append({"field": qid, "rule": "required", "message": f"'{qid}' is required."})
        else:
            errs = validate_answer(question, answer_map[qid])
            missing.extend({**e, "field": e.get("field", qid)} for e in errs)
    if missing:
        raise ValidationError("Journey cannot be completed — some answers are missing or invalid.", details=missing)

    resolved = _resolve_values(jc, answer_map)

    # Upload presence signals (by the file question's persistAs).
    uploads = (
        await session.execute(select(Upload).where(Upload.journey_id == journey.id))
    ).scalars().all()
    for up in uploads:
        q = get_config().get_question(journey.journey_key, up.question_id) if up.question_id else None
        pa = (q or {}).get("config", {}).get("persistAs") if q else None
        if pa:
            resolved[pa] = True

    signals = dict(resolved)

    # Context for CRM + email interpolation.
    context: dict[str, Any] = {
        "firstName": resolved.get("firstName"),
        "email": resolved.get("email"),
        "phone": resolved.get("phone"),
        "organisationName": resolved.get("organisationName"),
        "preferredContact": resolved.get("preferredContact"),
        "journeyStage": resolved.get("journeyStage"),
        "decisionMaker": resolved.get("decisionMaker"),
        **{k: v for k, v in resolved.items() if isinstance(v, (str, int, float, bool))},
    }

    settings = get_settings()

    # CRM payload + lead score.
    crm_event = await crm_service.generate_crm_event(
        session, journey, jc, context, signals, crm_service.get_crm_adapter(settings.crm_provider)
    )
    context["leadScore"] = crm_event.lead_score

    # Emails queued.
    emails = await email_service.queue_emails(session, journey, jc, context)

    # Journey metadata (improvement #6).
    persists = jc.journey.get("metadata", {}).get("persists", [])
    computed = {
        "journeyType": jc.journey_type,
        "version": jc.config_version,
        "leadSource": journey.lead_source,
        "createdDate": journey.started_at.isoformat() if journey.started_at else None,
        "updatedDate": utcnow().isoformat(),
    }
    for key in persists:
        value = computed.get(key, resolved.get(key))
        session.add(JourneyMetadata(journey_id=journey.id, key=key, value={"value": value}))

    # Timeline: submission milestone + generated artifacts.
    await timeline_service.emit_config_event(
        session, journey, jc, trigger="engine:conversation_completed",
        evidence={"leadScore": crm_event.lead_score},
    )
    await timeline_service.emit_event(
        session, journey, type="crm_generated", label="CRM Payload Generated",
        evidence={"pipeline": crm_event.pipeline, "leadScore": crm_event.lead_score}, source="backend",
    )
    await timeline_service.emit_event(
        session, journey, type="email_queued", label="Emails Queued",
        evidence={"count": len(emails)}, source="backend",
    )

    session.add(Interaction(journey_id=journey.id, type="submission", ref_id=crm_event.id, payload={"leadScore": crm_event.lead_score}))

    journey.status = "completed"
    journey.completed_at = utcnow()
    journey.completion_pct = 100.0
    # advance to terminal if reachable
    if jc.ordered_nodes:
        journey.current_node_id = jc.ordered_nodes[-1]
        journey.current_step = len(jc.step_question_ids)
    await session.flush()

    return {
        "journeyId": journey.id,
        "status": journey.status,
        "outcome": jc.confirmation.get("journeyKey", journey.journey_key),
        "crmEventId": crm_event.id,
        "leadScore": crm_event.lead_score,
        "emailsQueued": len(emails),
    }


async def list_timeline(session: AsyncSession, journey: Journey) -> list:
    from ..models import TimelineEvent

    return (
        await session.execute(
            select(TimelineEvent)
            .where(TimelineEvent.journey_id == journey.id)
            .order_by(TimelineEvent.occurred_at.asc(), TimelineEvent.created_at.asc())
        )
    ).scalars().all()

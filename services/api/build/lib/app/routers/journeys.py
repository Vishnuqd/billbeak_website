from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..config_loader import get_config
from ..db import get_session
from ..errors import BadRequestError, ValidationError
from ..models import Journey
from ..schemas import (
    AnswerIn,
    AnswerResultOut,
    CompleteResultOut,
    JourneyCreateIn,
    JourneyStateOut,
    TimelineEventOut,
    UploadOut,
)
from ..services import journeys as svc
from ..services.uploads import get_upload_provider

router = APIRouter(prefix="/journeys", tags=["journeys"])


def _current_question(journey: Journey) -> dict[str, Any] | None:
    cfg = get_config()
    jc = cfg.journey(journey.journey_key)
    if jc is None or not journey.current_node_id:
        return None
    node = jc.node(journey.current_node_id)
    if not node or node.get("kind") != "question":
        return None
    return cfg.get_question(journey.journey_key, node["questionId"])


def _state(journey: Journey) -> JourneyStateOut:
    return JourneyStateOut(
        id=journey.id,
        journeyKey=journey.journey_key,
        status=journey.status,
        currentNodeId=journey.current_node_id,
        currentQuestion=_current_question(journey),
        currentStep=journey.current_step,
        totalSteps=journey.total_steps,
        completionPct=journey.completion_pct,
    )


@router.post("", response_model=JourneyStateOut, status_code=201)
async def create_journey(body: JourneyCreateIn, session: AsyncSession = Depends(get_session)) -> JourneyStateOut:
    journey, _ = await svc.create_journey(session, journey_key=body.journeyKey, lead_source=body.leadSource)
    await session.commit()
    await session.refresh(journey)
    return _state(journey)


@router.get("/{journey_id}", response_model=JourneyStateOut)
async def get_journey(journey_id: str, session: AsyncSession = Depends(get_session)) -> JourneyStateOut:
    journey = await svc.get_journey(session, journey_id)
    return _state(journey)


@router.post("/{journey_id}/answers", response_model=AnswerResultOut)
async def submit_answer(
    journey_id: str, body: AnswerIn, session: AsyncSession = Depends(get_session)
) -> AnswerResultOut:
    journey = await svc.get_journey(session, journey_id)
    await svc.submit_answer(session, journey, question_id=body.questionId, value=body.value)
    await session.commit()
    await session.refresh(journey)
    return AnswerResultOut(
        journeyId=journey.id,
        status=journey.status,
        currentNodeId=journey.current_node_id,
        currentQuestion=_current_question(journey),
        completionPct=journey.completion_pct,
    )


@router.post("/{journey_id}/uploads", response_model=UploadOut, status_code=201)
async def upload_file(
    journey_id: str,
    questionId: str | None = Form(default=None),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> UploadOut:
    journey = await svc.get_journey(session, journey_id)
    settings = get_settings()

    data = await file.read()

    # Backend enforces size + accepted types from configuration.
    cfg = get_config()
    question = cfg.get_question(journey.journey_key, questionId) if questionId else None
    q_config = (question or {}).get("config", {})
    max_mb = min(int(q_config.get("maxSizeMB", settings.upload_max_mb)), settings.upload_max_mb)
    if len(data) > max_mb * 1024 * 1024:
        raise ValidationError(
            "File too large.",
            details=[{"field": questionId or "file", "rule": "maxSize", "message": f"Max {max_mb} MB."}],
        )
    accept = q_config.get("accept")
    if accept:
        allowed = [a.strip().lower() for a in accept.split(",") if a.strip()]
        name = (file.filename or "").lower()
        if allowed and not any(name.endswith(ext) for ext in allowed):
            raise ValidationError(
                "Unsupported file type.",
                details=[{"field": questionId or "file", "rule": "accept", "message": f"Allowed: {accept}."}],
            )

    provider = get_upload_provider(settings)
    stored = provider.save(
        journey_id=str(journey.id),
        filename=file.filename or "upload",
        content_type=file.content_type or "application/octet-stream",
        data=data,
    )
    upload = await svc.register_upload(
        session,
        journey,
        question_id=questionId,
        filename=file.filename or "upload",
        content_type=file.content_type or "application/octet-stream",
        stored=stored,
    )
    await session.commit()
    await session.refresh(upload)
    return UploadOut(
        id=upload.id,
        questionId=upload.question_id,
        filename=upload.filename,
        contentType=upload.content_type,
        sizeBytes=upload.size_bytes,
        sha256=upload.sha256,
        scanStatus=upload.scan_status,
        provider=upload.provider,
        url=upload.url,
    )


@router.post("/{journey_id}/complete", response_model=CompleteResultOut)
async def complete_journey(journey_id: str, session: AsyncSession = Depends(get_session)) -> CompleteResultOut:
    journey = await svc.get_journey(session, journey_id)
    result = await svc.complete_journey(session, journey)
    await session.commit()
    jc = get_config().journey(journey.journey_key)
    return CompleteResultOut(
        journeyId=result["journeyId"],
        status=result["status"],
        outcome=result["outcome"],
        crmEventId=result["crmEventId"],
        leadScore=result["leadScore"],
        emailsQueued=result["emailsQueued"],
        confirmation=jc.confirmation if jc else {},
    )


@router.get("/{journey_id}/timeline", response_model=list[TimelineEventOut])
async def get_timeline(journey_id: str, session: AsyncSession = Depends(get_session)) -> list[TimelineEventOut]:
    journey = await svc.get_journey(session, journey_id)
    events = await svc.list_timeline(session, journey)
    return [
        TimelineEventOut(
            type=e.type,
            label=e.label,
            occurredAt=e.occurred_at,
            verificationStatus=e.verification_status,
            visibility=e.visibility,
            evidence=e.evidence,
        )
        for e in events
    ]

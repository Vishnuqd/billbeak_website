"""Journey persistence tests — assert rows land in the database directly."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select

from app.models import (
    Answer,
    CRMEvent,
    EmailQueue,
    Journey,
    JourneyMetadata,
    TimelineEvent,
    Upload,
)
from tests.conftest import complete_employer


async def test_full_persistence(client, db, employer_answers):
    jid = uuid.UUID(await complete_employer(client, employer_answers))

    journey = await db.get(Journey, jid)
    assert journey is not None
    assert journey.status == "completed"
    assert journey.completion_pct == 100.0
    assert journey.completed_at is not None

    # answers persisted (current)
    ans_count = await db.scalar(
        select(func.count()).select_from(Answer).where(Answer.journey_id == jid, Answer.is_current.is_(True))
    )
    assert ans_count == len(employer_answers)

    # metadata (improvement #6)
    meta = {
        m.key: (m.value or {}).get("value")
        for m in (await db.execute(select(JourneyMetadata).where(JourneyMetadata.journey_id == jid))).scalars()
    }
    assert meta.get("journeyType") == "b2b"
    assert meta.get("journeyStage") == "already_hiring"
    assert meta.get("decisionMaker") == "decision_maker"
    assert meta.get("preferredContact") == "email"
    assert meta.get("previousRelationship") == "no"
    assert meta.get("version") == "1.0.0"

    # timeline
    tl_types = [
        t.type
        for t in (await db.execute(select(TimelineEvent).where(TimelineEvent.journey_id == jid))).scalars()
    ]
    assert "journey_started" in tl_types
    assert "hiring_enquiry_submitted" in tl_types
    assert "crm_generated" in tl_types
    assert "email_queued" in tl_types

    # CRM payload + lead score
    crm = (await db.execute(select(CRMEvent).where(CRMEvent.journey_id == jid))).scalars().first()
    assert crm is not None
    assert crm.pipeline == "Talent Engineering — Hiring"
    assert crm.lead_score == 74  # already_hiring 40 + 101_500 14 + decision_maker 20
    assert crm.payload["contact"]["email"] == "a@acme.com"

    # emails queued
    email_count = await db.scalar(
        select(func.count()).select_from(EmailQueue).where(EmailQueue.journey_id == jid)
    )
    assert email_count == 4


async def test_upload_metadata_persisted(client, db):
    r = await client.post("/journeys", json={"journeyKey": "employer"})
    jid = uuid.UUID(r.json()["id"])
    files = {"file": ("brief.pdf", b"%PDF-1.4 data", "application/pdf")}
    await client.post(f"/journeys/{jid}/uploads", data={"questionId": "emp_brief"}, files=files)

    upload = (await db.execute(select(Upload).where(Upload.journey_id == jid))).scalars().first()
    assert upload is not None
    assert upload.provider == "local"
    assert upload.size_bytes == len(b"%PDF-1.4 data")
    assert upload.sha256 is not None
    assert upload.object_key.startswith(str(jid))

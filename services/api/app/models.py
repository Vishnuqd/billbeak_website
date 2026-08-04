"""Generic, journey-agnostic persistence models.

There are NO journey-specific tables. A new journey folder in config/conversations
needs no schema change: answers, metadata, timeline and CRM/email rows are all
generic and driven by configuration.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import GUID, JSONVariant, Base, TimestampMixin


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Person(TimestampMixin, Base):
    __tablename__ = "person"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    primary_email: Mapped[str | None] = mapped_column(String(320), index=True)
    primary_phone: Mapped[str | None] = mapped_column(String(40))
    display_name: Mapped[str | None] = mapped_column(String(120))
    attributes: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    journeys: Mapped[list["Journey"]] = relationship(back_populates="person")


class Journey(TimestampMixin, Base):
    __tablename__ = "journey"
    __mapper_args__ = {"version_id_col": None}  # set below to enable optimistic lock

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        GUID(), ForeignKey("person.id", ondelete="SET NULL"), index=True
    )
    journey_key: Mapped[str] = mapped_column(String(64), index=True)
    journey_type: Mapped[str | None] = mapped_column(String(32))
    flow_version: Mapped[int] = mapped_column(Integer, default=1)
    config_version: Mapped[str | None] = mapped_column(String(32))

    status: Mapped[str] = mapped_column(String(24), default="in_progress", index=True)
    current_node_id: Mapped[str | None] = mapped_column(String(64))
    current_step: Mapped[int] = mapped_column(Integer, default=0)
    total_steps: Mapped[int] = mapped_column(Integer, default=0)
    completion_pct: Mapped[float] = mapped_column(Float, default=0.0)

    lead_source: Mapped[str | None] = mapped_column(String(120))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    row_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    person: Mapped[Person | None] = relationship(back_populates="journeys")
    answers: Mapped[list["Answer"]] = relationship(back_populates="journey")
    metadata_entries: Mapped[list["JourneyMetadata"]] = relationship(back_populates="journey")
    timeline_events: Mapped[list["TimelineEvent"]] = relationship(back_populates="journey")
    uploads: Mapped[list["Upload"]] = relationship(back_populates="journey")


# Enable optimistic locking on Journey.
Journey.__mapper_args__ = {"version_id_col": Journey.__table__.c.row_version}


class JourneyMetadata(TimestampMixin, Base):
    __tablename__ = "journey_metadata"
    __table_args__ = (UniqueConstraint("journey_id", "key", name="uq_journey_metadata_key"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("journey.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(64))
    value: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)

    journey: Mapped[Journey] = relationship(back_populates="metadata_entries")


class Answer(TimestampMixin, Base):
    __tablename__ = "answer"
    __table_args__ = (Index("ix_answer_journey_question", "journey_id", "question_id"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("journey.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[str] = mapped_column(String(64))
    value: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)
    answer_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)
    validation_state: Mapped[str] = mapped_column(String(16), default="valid")
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)

    journey: Mapped[Journey] = relationship(back_populates="answers")


class Interaction(TimestampMixin, Base):
    """Generic activity record: question answer, upload, submission, future AI/CRM/email."""

    __tablename__ = "interaction"
    __table_args__ = (Index("ix_interaction_journey_type", "journey_id", "type"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("journey.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(String(32))
    ref_id: Mapped[uuid.UUID | None] = mapped_column(GUID())
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)


class TimelineEvent(TimestampMixin, Base):
    __tablename__ = "timeline_event"
    __table_args__ = (Index("ix_timeline_journey_time", "journey_id", "occurred_at"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("journey.id", ondelete="CASCADE"), index=True
    )
    person_id: Mapped[uuid.UUID | None] = mapped_column(GUID())
    type: Mapped[str] = mapped_column(String(64), index=True)
    label: Mapped[str] = mapped_column(String(160))
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)
    verification_status: Mapped[str] = mapped_column(String(16), default="system")
    visibility: Mapped[str] = mapped_column(String(16), default="private")
    source: Mapped[str | None] = mapped_column(String(64))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    journey: Mapped[Journey] = relationship(back_populates="timeline_events")


class Upload(TimestampMixin, Base):
    __tablename__ = "upload"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("journey.id", ondelete="CASCADE"), index=True
    )
    question_id: Mapped[str | None] = mapped_column(String(64))
    provider: Mapped[str] = mapped_column(String(16))
    object_key: Mapped[str] = mapped_column(String(512))
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64))
    scan_status: Mapped[str] = mapped_column(String(16), default="pending")
    url: Mapped[str | None] = mapped_column(String(1024))
    upload_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    journey: Mapped[Journey] = relationship(back_populates="uploads")


class CRMEvent(TimestampMixin, Base):
    __tablename__ = "crm_event"

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("journey.id", ondelete="CASCADE"), index=True
    )
    pipeline: Mapped[str | None] = mapped_column(String(120))
    owner_team: Mapped[str | None] = mapped_column(String(64))
    lead_score: Mapped[int] = mapped_column(Integer, default=0)
    provider: Mapped[str] = mapped_column(String(24), default="none")
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONVariant)


class EmailQueue(TimestampMixin, Base):
    __tablename__ = "email_queue"
    __table_args__ = (Index("ix_email_status_sched", "status", "scheduled_at"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    journey_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("journey.id", ondelete="CASCADE"), index=True
    )
    message_id: Mapped[str] = mapped_column(String(64))
    type: Mapped[str] = mapped_column(String(16))
    recipient: Mapped[str | None] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(320))
    variables: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)
    status: Mapped[str] = mapped_column(String(16), default="queued")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_entity", "entity_type", "entity_id"),)

    id: Mapped[uuid.UUID] = mapped_column(GUID(), primary_key=True, default=_uuid)
    entity_type: Mapped[str] = mapped_column(String(48))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(GUID())
    action: Mapped[str] = mapped_column(String(48))
    actor: Mapped[str | None] = mapped_column(String(120))
    request_id: Mapped[str | None] = mapped_column(String(64))
    data: Mapped[dict[str, Any] | None] = mapped_column(JSONVariant)
    note: Mapped[str | None] = mapped_column(Text)

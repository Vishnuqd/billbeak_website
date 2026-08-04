"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.db import GUID, JSONVariant

revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NOW = sa.text("CURRENT_TIMESTAMP")


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=_NOW),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=_NOW),
    ]


def upgrade() -> None:
    op.create_table(
        "person",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("primary_email", sa.String(320)),
        sa.Column("primary_phone", sa.String(40)),
        sa.Column("display_name", sa.String(120)),
        sa.Column("attributes", JSONVariant),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_person_primary_email", "person", ["primary_email"])

    op.create_table(
        "journey",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("person_id", GUID(), sa.ForeignKey("person.id", ondelete="SET NULL")),
        sa.Column("journey_key", sa.String(64), nullable=False),
        sa.Column("journey_type", sa.String(32)),
        sa.Column("flow_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("config_version", sa.String(32)),
        sa.Column("status", sa.String(24), nullable=False, server_default="in_progress"),
        sa.Column("current_node_id", sa.String(64)),
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_steps", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("lead_source", sa.String(120)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("row_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_journey_person_id", "journey", ["person_id"])
    op.create_index("ix_journey_journey_key", "journey", ["journey_key"])
    op.create_index("ix_journey_status", "journey", ["status"])

    op.create_table(
        "journey_metadata",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("journey_id", GUID(), sa.ForeignKey("journey.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("value", JSONVariant),
        *_timestamps(),
        sa.UniqueConstraint("journey_id", "key", name="uq_journey_metadata_key"),
    )
    op.create_index("ix_journey_metadata_journey_id", "journey_metadata", ["journey_id"])

    op.create_table(
        "answer",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("journey_id", GUID(), sa.ForeignKey("journey.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.String(64), nullable=False),
        sa.Column("value", JSONVariant),
        sa.Column("answer_metadata", JSONVariant),
        sa.Column("validation_state", sa.String(16), nullable=False, server_default="valid"),
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.true()),
        *_timestamps(),
    )
    op.create_index("ix_answer_journey_id", "answer", ["journey_id"])
    op.create_index("ix_answer_journey_question", "answer", ["journey_id", "question_id"])

    op.create_table(
        "interaction",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("journey_id", GUID(), sa.ForeignKey("journey.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("ref_id", GUID()),
        sa.Column("payload", JSONVariant),
        *_timestamps(),
    )
    op.create_index("ix_interaction_journey_id", "interaction", ["journey_id"])
    op.create_index("ix_interaction_journey_type", "interaction", ["journey_id", "type"])

    op.create_table(
        "timeline_event",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("journey_id", GUID(), sa.ForeignKey("journey.id", ondelete="CASCADE"), nullable=False),
        sa.Column("person_id", GUID()),
        sa.Column("type", sa.String(64), nullable=False),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("evidence", JSONVariant),
        sa.Column("verification_status", sa.String(16), nullable=False, server_default="system"),
        sa.Column("visibility", sa.String(16), nullable=False, server_default="private"),
        sa.Column("source", sa.String(64)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_timeline_event_journey_id", "timeline_event", ["journey_id"])
    op.create_index("ix_timeline_event_type", "timeline_event", ["type"])
    op.create_index("ix_timeline_journey_time", "timeline_event", ["journey_id", "occurred_at"])

    op.create_table(
        "upload",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("journey_id", GUID(), sa.ForeignKey("journey.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.String(64)),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("object_key", sa.String(512), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(128), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64)),
        sa.Column("scan_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("url", sa.String(1024)),
        sa.Column("upload_metadata", JSONVariant),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_upload_journey_id", "upload", ["journey_id"])

    op.create_table(
        "crm_event",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("journey_id", GUID(), sa.ForeignKey("journey.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline", sa.String(120)),
        sa.Column("owner_team", sa.String(64)),
        sa.Column("lead_score", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("provider", sa.String(24), nullable=False, server_default="none"),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("payload", JSONVariant, nullable=False),
        *_timestamps(),
    )
    op.create_index("ix_crm_event_journey_id", "crm_event", ["journey_id"])
    op.create_index("ix_crm_event_status", "crm_event", ["status"])

    op.create_table(
        "email_queue",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("journey_id", GUID(), sa.ForeignKey("journey.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_id", sa.String(64), nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("recipient", sa.String(320)),
        sa.Column("subject", sa.String(320), nullable=False),
        sa.Column("variables", JSONVariant),
        sa.Column("status", sa.String(16), nullable=False, server_default="queued"),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_email_queue_journey_id", "email_queue", ["journey_id"])
    op.create_index("ix_email_status_sched", "email_queue", ["status", "scheduled_at"])

    op.create_table(
        "audit_log",
        sa.Column("id", GUID(), primary_key=True),
        sa.Column("entity_type", sa.String(48), nullable=False),
        sa.Column("entity_id", GUID()),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("actor", sa.String(120)),
        sa.Column("request_id", sa.String(64)),
        sa.Column("data", JSONVariant),
        sa.Column("note", sa.Text()),
        *_timestamps(),
    )
    op.create_index("ix_audit_entity", "audit_log", ["entity_type", "entity_id"])


def downgrade() -> None:
    for table in (
        "audit_log",
        "email_queue",
        "crm_event",
        "upload",
        "timeline_event",
        "interaction",
        "answer",
        "journey_metadata",
        "journey",
        "person",
    ):
        op.drop_table(table)

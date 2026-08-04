"""Pydantic v2 request/response models. Field names are camelCase so the
generated OpenAPI produces clean, TypeScript-friendly schemas for the frontend.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- requests -------------------------------------------------------------

class JourneyCreateIn(ApiModel):
    journeyKey: str = Field(..., description="Journey key, e.g. 'employer'. Discovered from configuration.")
    leadSource: str | None = Field(default=None, description="Attribution source (utm, referrer…).")


class AnswerIn(ApiModel):
    questionId: str
    value: Any = Field(..., description="Answer value: string, number, array, or group object.")


# ---- responses ------------------------------------------------------------

class JourneyStateOut(ApiModel):
    id: uuid.UUID
    journeyKey: str
    status: str
    currentNodeId: str | None
    currentQuestion: dict[str, Any] | None
    currentStep: int
    totalSteps: int
    completionPct: float


class AnswerResultOut(ApiModel):
    journeyId: uuid.UUID
    status: str
    currentNodeId: str | None
    currentQuestion: dict[str, Any] | None
    completionPct: float


class UploadOut(ApiModel):
    id: uuid.UUID
    questionId: str | None
    filename: str
    contentType: str
    sizeBytes: int
    sha256: str | None
    scanStatus: str
    provider: str
    url: str | None


class CompleteResultOut(ApiModel):
    journeyId: uuid.UUID
    status: str
    outcome: str
    crmEventId: uuid.UUID
    leadScore: int
    emailsQueued: int
    confirmation: dict[str, Any]


class TimelineEventOut(ApiModel):
    type: str
    label: str
    occurredAt: datetime
    verificationStatus: str
    visibility: str
    evidence: dict[str, Any] | None


class ConfigurationOut(ApiModel):
    journeyKey: str
    name: str
    version: str
    journeyType: str | None
    flow: dict[str, Any]
    questions: dict[str, Any]
    confirmation: dict[str, Any]
    intro: dict[str, Any]


class MasterConfigurationOut(ApiModel):
    version: str
    intro: dict[str, Any]
    navigator: dict[str, Any]
    flow: dict[str, Any]
    questions: dict[str, Any]
    journeys: list[dict[str, Any]]


class HealthOut(ApiModel):
    status: str
    version: str


class ReadyOut(ApiModel):
    status: str
    database: str
    configuration: str
    journeys: int


class ErrorDetail(ApiModel):
    rule: str | None = None
    field: str | None = None
    message: str


class ErrorBody(ApiModel):
    code: str
    message: str
    details: list[ErrorDetail] = []
    requestId: str


class ErrorOut(ApiModel):
    error: ErrorBody

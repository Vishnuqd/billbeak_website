"""REST API + full journey integration tests. Every journey is driven purely
from its configuration, proving the backend is journey-agnostic."""

from __future__ import annotations

from typing import Any

import pytest

from app.config_loader import get_config

JOURNEYS = ["employer", "corporate", "university", "community", "candidate", "join", "something-else"]


def _synth_field(field: dict[str, Any]) -> Any:
    ft = field.get("type")
    if ft == "consent":
        return True
    if ft == "email":
        return "person@example.com"
    if ft in ("url", "website", "linkedin"):
        return "https://example.com/profile"
    if ft == "tel":
        return "+91 9876543210"
    if ft == "single_select":
        return field["options"][0]["value"]
    if ft == "file":
        return None
    return "A valid answer."


def _synth_value(question: dict[str, Any]) -> Any:
    t = question.get("type")
    if t == "single_choice":
        return question["options"][0]["value"]
    if t == "multi_choice":
        return [question["options"][0]["value"]]
    if t == "email":
        return "person@example.com"
    if t in ("website", "linkedin"):
        return "https://example.com"
    if t == "number":
        return "3"
    if t == "phone":
        return "+91 9876543210"
    if t == "group":
        config = question.get("config", {})
        data: dict[str, Any] = {}
        for f in config.get("fields", []):
            val = _synth_field(f)
            if val is not None:
                data[f["name"]] = val
        require = config.get("requireAtLeast")
        if require:
            first = require["fields"][0]
            data.setdefault(first, "https://example.com/profile")
        return data
    return "A valid answer."


async def test_health_and_ready(client):
    assert (await client.get("/health")).status_code == 200
    r = await client.get("/ready")
    assert r.status_code == 200 and r.json()["journeys"] == 7


async def test_master_and_journey_configuration(client):
    r = await client.get("/configuration")
    body = r.json()
    assert r.status_code == 200 and body["flow"]["entry"] == "sh_name"
    r = await client.get("/configuration/employer")
    assert r.status_code == 200 and r.json()["journeyKey"] == "employer"
    assert (await client.get("/configuration/does-not-exist")).status_code == 404


async def test_create_unknown_journey_404(client):
    r = await client.post("/journeys", json={"journeyKey": "nope"})
    assert r.status_code == 404


async def test_invalid_answer_422(client):
    r = await client.post("/journeys", json={"journeyKey": "employer"})
    jid = r.json()["id"]
    # bad email into a contact group
    r = await client.post(
        f"/journeys/{jid}/answers",
        json={"questionId": "emp_contact", "value": {"email": "nope", "preferredContact": "email", "consent": True}},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


async def test_complete_missing_required_422(client):
    r = await client.post("/journeys", json={"journeyKey": "employer"})
    jid = r.json()["id"]
    r = await client.post(f"/journeys/{jid}/complete")
    assert r.status_code == 422
    assert len(r.json()["error"]["details"]) > 0


@pytest.mark.parametrize("journey_key", JOURNEYS)
async def test_every_journey_completes(client, journey_key):
    cfg = get_config()
    jc = cfg.journey(journey_key)

    r = await client.post("/journeys", json={"journeyKey": journey_key, "leadSource": "test"})
    assert r.status_code == 201, r.text
    jid = r.json()["id"]

    for qid in jc.step_question_ids:
        question = cfg.get_question(journey_key, qid)
        if question.get("type") == "file" and question.get("optional", False):
            continue  # optional upload — skip
        r = await client.post(f"/journeys/{jid}/answers", json={"questionId": qid, "value": _synth_value(question)})
        assert r.status_code == 200, f"{journey_key}/{qid}: {r.text}"

    r = await client.post(f"/journeys/{jid}/complete")
    assert r.status_code == 200, f"{journey_key} complete: {r.text}"
    body = r.json()
    assert body["status"] == "completed"
    assert body["emailsQueued"] >= 1
    assert "confirmation" in body and body["confirmation"]

    # duplicate submission guarded
    assert (await client.post(f"/journeys/{jid}/complete")).status_code == 409

    # timeline persisted
    tl = await client.get(f"/journeys/{jid}/timeline")
    types = [e["type"] for e in tl.json()]
    assert "journey_started" in types


async def test_upload_flow(client):
    r = await client.post("/journeys", json={"journeyKey": "employer"})
    jid = r.json()["id"]
    files = {"file": ("role-brief.pdf", b"%PDF-1.4 fake brief", "application/pdf")}
    r = await client.post(f"/journeys/{jid}/uploads", data={"questionId": "emp_brief"}, files=files)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["filename"] == "role-brief.pdf" and body["sizeBytes"] > 0 and body["sha256"]
    assert body["provider"] == "local"


async def test_upload_rejects_bad_type(client):
    r = await client.post("/journeys", json={"journeyKey": "employer"})
    jid = r.json()["id"]
    files = {"file": ("virus.exe", b"MZ", "application/octet-stream")}
    r = await client.post(f"/journeys/{jid}/uploads", data={"questionId": "emp_brief"}, files=files)
    assert r.status_code == 422

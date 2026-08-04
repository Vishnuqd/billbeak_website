"""Test fixtures. A hermetic SQLite database (portable models) — no external
services required. Production runs on PostgreSQL via Alembic; the same code path
is exercised here.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

# Configure the test database BEFORE importing the app (settings are cached).
_TMP_DB = Path(tempfile.gettempdir()) / "billbeak_api_test.sqlite3"
if _TMP_DB.exists():
    _TMP_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TMP_DB}"
os.environ["UPLOAD_DIR"] = str(Path(tempfile.gettempdir()) / "billbeak_api_uploads")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402


@pytest_asyncio.fixture
async def client():
    from app.main import app

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c


@pytest_asyncio.fixture
async def db():
    from app.db import SessionLocal

    async with SessionLocal() as session:
        yield session


@pytest.fixture
def employer_answers():
    return [
        ("sh_name", "Sruthi"),
        ("emp_role", "I lead hiring."),
        ("emp_stage", "already_hiring"),
        ("sh_decision_maker", "decision_maker"),
        ("emp_size", "101_500"),
        ("emp_need", "Three AI engineers in Bengaluru."),
        ("emp_org", {"organisationName": "Acme", "companyUrl": "https://acme.com"}),
        (
            "emp_contact",
            {
                "email": "a@acme.com",
                "phone": "+91 9876543210",
                "preferredContact": "email",
                "consent": True,
                "organisationName": "Acme",
                "previousRelationship": "no",
            },
        ),
    ]


async def complete_employer(client, answers) -> str:
    r = await client.post("/journeys", json={"journeyKey": "employer", "leadSource": "homepage"})
    jid = r.json()["id"]
    for qid, value in answers:
        resp = await client.post(f"/journeys/{jid}/answers", json={"questionId": qid, "value": value})
        assert resp.status_code == 200, resp.text
    resp = await client.post(f"/journeys/{jid}/complete")
    assert resp.status_code == 200, resp.text
    return jid

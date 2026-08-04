"""Migration test: `alembic upgrade head` builds the full schema on a fresh DB.

Runs in a subprocess against an isolated temp SQLite database (portable types),
so it exercises the real Alembic path without touching the test DB or needing a
running PostgreSQL.
"""

from __future__ import annotations

import os
import sqlite3
import subprocess
import sys
import tempfile
from pathlib import Path

EXPECTED_TABLES = {
    "person", "journey", "journey_metadata", "answer", "interaction",
    "timeline_event", "upload", "crm_event", "email_queue", "audit_log",
}


def test_alembic_upgrade_head_builds_schema():
    api_dir = Path(__file__).resolve().parents[1]
    db_path = Path(tempfile.gettempdir()) / "billbeak_migration_test.sqlite3"
    if db_path.exists():
        db_path.unlink()

    env = dict(os.environ, DATABASE_URL=f"sqlite+aiosqlite:///{db_path}")
    alembic_bin = Path(sys.executable).parent / "alembic"
    result = subprocess.run(
        [str(alembic_bin), "upgrade", "head"],
        cwd=str(api_dir),
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr

    conn = sqlite3.connect(db_path)
    try:
        tables = {
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
    finally:
        conn.close()
    db_path.unlink(missing_ok=True)

    assert EXPECTED_TABLES.issubset(tables), f"missing: {EXPECTED_TABLES - tables}"

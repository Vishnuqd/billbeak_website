# Billbeak "Let's Talk" — Backend API

A **generic, configuration-driven** FastAPI service that powers the `/talk`
experience. It consumes the frozen business configuration under
`config/conversations/` **without any change** to the frontend, engine, or config.
The backend knows nothing about Employer/Candidate/University/… — a new journey
folder is supported with **zero code changes**.

- **Stack:** Python 3.13 · FastAPI · SQLAlchemy 2.x (async) · Alembic · Pydantic v2 · PostgreSQL (SQLite for hermetic tests).
- **OpenAPI:** generated automatically — Swagger UI at `/docs`, ReDoc at `/redoc`, spec at `/openapi.json`.

---

## Architecture

```
apps/talk (React, frozen)  ──HTTP──▶  services/api (this)  ──▶  PostgreSQL
                                          │
        config/conversations/ (frozen) ──▶ ConfigLoader (compose + validate + cache)
                                          │
      Journey service (source of truth)  ─┼─▶ Upload provider   (local | s3 | r2)
                                          ├─▶ Email queue        (rows + sender abstraction)
                                          ├─▶ CRM adapter        (payload from crm.json; none/HubSpot/…)
                                          └─▶ Timeline           (events from timeline.json)
```

```
app/
├─ config.py            Settings (env)                errors.py   Structured errors + envelope
├─ db.py                Portable GUID/JSON, engine    logging.py  Request-id + logging
├─ models.py            Generic tables (no journey-specific columns)
├─ schemas.py           Pydantic request/response (camelCase → clean TS schemas)
├─ config_loader/       loader · composer · conditions · validation · models
├─ services/            journeys · uploads · email · crm · timeline
├─ routers/             journeys · configuration · health
└─ main.py              App, middleware, exception handlers, lifespan (fail-fast config load)
migrations/             Alembic (async env, portable initial migration)
tests/                  loader · validation · API (all 7 journeys) · persistence · migration
```

### Configuration-driven (the core principle)
The `ConfigLoader` reads `manifest.json`, `_shared/*`, and each journey's six
files, then **composes** them per the documented contract (`config/conversations/README.md`):
resolves `uses`/`extends`/`addFields`, stitches the root (`sh_name → sh_navigator`
branch) and shared contact tail into one master flow, projects each journey's step
chain, validates every reference, and **fails fast** on any invalid configuration.
Answer validation, branching (`resolve_next_node`), lead scoring, CRM payloads,
emails and timeline events are all derived from configuration.

### Generic persistence (no journey-specific tables)
`person · journey · journey_metadata · answer · interaction · timeline_event ·
upload · crm_event · email_queue · audit_log`. Answers are append-only
(`is_current`), a Person has many Journeys, and `journey.row_version` gives
optimistic locking. Every table has `created_at`/`updated_at`; soft-delete
(`deleted_at`) on person/journey/upload.

---

## Run it

### 1. PostgreSQL
```bash
createdb billbeak     # or: docker run -e POSTGRES_PASSWORD=billbeak -e POSTGRES_USER=billbeak -e POSTGRES_DB=billbeak -p 5432:5432 postgres:16
```

### 2. Install + configure
```bash
cd services/api
python3.13 -m venv .venv && ./.venv/bin/pip install -e '.[test]'
cp .env.example .env        # defaults point at postgres://billbeak:billbeak@localhost:5432/billbeak
```

### 3. Migrate
```bash
./.venv/bin/alembic upgrade head
```

### 4. Start
```bash
./.venv/bin/uvicorn app.main:app --reload --port 8000
# Swagger: http://localhost:8000/docs   ·   Health: /health   ·   Readiness: /ready
```

### 5. Tests (hermetic — no Postgres needed)
```bash
./.venv/bin/python -m pytest        # 33 tests: loader, validation, all 7 journeys, persistence, migration
```

> **Zero-Postgres quickstart:** set `DATABASE_URL=sqlite+aiosqlite:///./billbeak.sqlite3`
> and just run uvicorn — tables are auto-created on startup for SQLite. Postgres
> uses Alembic.

---

## API

| Method & path | Purpose |
|---|---|
| `POST /journeys` | Start a journey (`{journeyKey, leadSource?}`) → state + first question |
| `GET /journeys/{id}` | Resume state (current question, completion %) |
| `POST /journeys/{id}/answers` | Validate + persist an answer, advance the flow |
| `POST /journeys/{id}/uploads` | Multipart upload (metadata persisted, provider-abstracted) |
| `POST /journeys/{id}/complete` | Finalise → CRM payload + queued emails + timeline + metadata |
| `GET /journeys/{id}/timeline` | The journey's timeline events |
| `GET /configuration` | The whole composed conversation (root + navigator + journeys) |
| `GET /configuration/{journey}` | A single journey's flow + questions + confirmation |
| `GET /health` · `GET /ready` | Liveness · readiness (DB + config) |

**Errors** use one envelope — `{ "error": { code, message, details[], requestId } }` —
with `400/404/409/422/500` and an `X-Request-ID` on every response.

**Validation is server-side and authoritative** (mirrors the engine): required
fields, types, `minSelected`, `requireAtLeast` groups, upload size/type,
duplicate-submission (409), and missing-required-on-complete (422). The frontend
is never trusted.

---

## Abstractions (swap without touching business logic)

- **Uploads** — `UploadProvider`: `local` (default, fully implemented), `s3`, `r2`
  (S3 API + custom endpoint, via lazy boto3). Metadata always stored.
- **Email** — a real queue (`email_queue` rows with `scheduled_at` from
  `delayMinutes`) + an `EmailSender` abstraction (`log` default). No provider APIs called.
- **CRM** — `CRMAdapter` (`none` default); payload and lead score generated from
  `crm.json`. HubSpot/Salesforce/Zoho plug in with no business-layer change.
- **Timeline** — events defined in `timeline.json`; `emitNow` events fire on
  start/complete, the rest are backend/CRM-driven later.

---

## Security posture (architecture prepared; not implemented this phase)
The seams exist without login: structured errors, request IDs, an `audit_log`
table, input sanitisation via strict Pydantic + server-side validation, and CORS
locked to the `/talk` origins. **JWT/admin auth, rate limiting, and audit-write
wiring are deliberately deferred** to a later phase, as instructed.

---

## Connecting the React `/talk` app
The frontend is **frozen** and not modified here. This service exposes exactly the
contracts its engine needs (create → answers → uploads → complete → timeline, plus
`/configuration`), CORS-enabled for `localhost:5173/4173`, with camelCase schemas
so `packages/api-client` can be generated from `/openapi.json`. Wiring the engine's
server `PersistenceAdapter`/`onSubmit` to this API is a one-file frontend change
reserved for the integration step — this phase delivers and verifies the backend
independently via its test suite and Swagger.

---

## Definition of Done — status
✓ Postgres migrations run · ✓ backend starts (fail-fast config) · ✓ Swagger works ·
✓ every journey completes (parametrized test over all 7) · ✓ answers persist ·
✓ journey metadata persists · ✓ timeline persists · ✓ upload metadata persists ·
✓ CRM payload generated (+ lead score) · ✓ emails queued · ✓ 33 tests pass ·
✓ no TODO placeholders · ✓ no mocked persistence · ✓ no fake external APIs.

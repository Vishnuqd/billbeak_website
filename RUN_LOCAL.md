# Running Billbeak "Let's Talk" locally

Two moving parts:

1. **Backend** — FastAPI at `services/api` (Python 3.13). Serves the config + persists journeys. Runs on **:8000**.
2. **Frontend** — the `/talk` app at `apps/talk` (Vite + React). Runs on **:5173**.

Start the **backend first**, then the frontend. You need two terminals.

> The project path contains a space (`website templates`), so keep the quotes around `cd` paths.

---

## TL;DR (quickest path — SQLite, no database to install)

**Terminal 1 — backend**
```bash
cd "services/api"
python3.13 -m venv .venv
./.venv/bin/pip install -e '.[test]'
DATABASE_URL="sqlite+aiosqlite:///./billbeak.sqlite3" ./.venv/bin/uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — frontend**
```bash
cd "apps/talk"
npm install
npm run dev
```

Open **http://localhost:5173/talk/** → click **"Let's begin"** and complete any journey.
Swagger API docs: **http://localhost:8000/docs**

That's it. The rest of this document explains each step, the PostgreSQL path, and troubleshooting.

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Python | 3.13+ | `python3.13 --version` |
| Node.js | 18+ (20+ recommended) | `node --version` |
| npm | 9+ | `npm --version` |
| PostgreSQL | 16 (optional — SQLite works for local) | `psql --version` |

macOS install (Homebrew): `brew install python@3.13 node postgresql@16`

---

## 1. Backend (`services/api`)

### 1a. One-time setup
```bash
cd "services/api"

# Create the virtual environment and install dependencies (app + test tools)
python3.13 -m venv .venv
./.venv/bin/pip install -e '.[test]'
```

### 1b. Choose a database

**Option A — SQLite (zero setup, recommended for local).**
Tables are created automatically on startup; no migration step needed.
```bash
export DATABASE_URL="sqlite+aiosqlite:///./billbeak.sqlite3"
```

**Option B — PostgreSQL (matches production).**
```bash
# create the database the default URL expects
createdb billbeak            # or: psql -c "CREATE DATABASE billbeak;"

export DATABASE_URL="postgresql+asyncpg://billbeak:billbeak@localhost:5432/billbeak"

# run migrations (creates all tables with native uuid/jsonb)
./.venv/bin/alembic upgrade head
```
> If your Postgres uses a different user/password/host, adjust the URL, e.g.
> `postgresql+asyncpg://<user>:<pass>@localhost:5432/billbeak`.

You can also copy `.env.example` to `.env` and set values there instead of exporting env vars each time:
```bash
cp .env.example .env         # then edit DATABASE_URL, etc.
```

### 1c. Start the API
```bash
./.venv/bin/uvicorn app.main:app --reload --port 8000
```
On start you should see: `loaded configuration v1.0.0 with 7 journeys`.

Verify:
- Health: http://localhost:8000/health → `{"status":"ok"}`
- Readiness: http://localhost:8000/ready → shows DB + journeys count
- **Swagger UI: http://localhost:8000/docs**
- OpenAPI JSON: http://localhost:8000/openapi.json

---

## 2. Frontend (`apps/talk`)

Open a **second terminal**.

### 2a. One-time setup
```bash
cd "apps/talk"
npm install
```

### 2b. (Optional) point at a non-default backend
The app defaults to `http://localhost:8000`. To change it:
```bash
cp .env.example .env          # sets VITE_API_URL=http://localhost:8000
```
Edit `.env` if your backend runs elsewhere. CORS on the backend already allows
`http://localhost:5173` and `http://localhost:4173`.

### 2c. Start the dev server
```bash
npm run dev
```
Open **http://localhost:5173/talk/** (note the `/talk/` path — the app is served under that base).

---

## 3. Use it

1. The **welcome screen** appears ("Let's find the right next step") → **Let's begin**.
2. Answer **"What should we call you?"** — your name personalises later questions.
3. Pick a door on **"what brings you to Billbeak today?"** (Employer, University, Student, etc.).
4. Answer the journey's questions. Uploads (e.g. a role brief / CV) upload with a progress bar.
5. On the final contact screen, submit → you get the **confirmation screen** with
   "what happens next" and a live timeline.

Everything is persisted to the backend. Check it in Swagger or the DB:
- `GET /journeys/{id}` — journey state
- `GET /journeys/{id}/timeline` — timeline events

---

## 4. Running the tests (optional)

**Backend** (hermetic — uses SQLite, no running server needed):
```bash
cd "services/api"
./.venv/bin/python -m pytest        # 33 tests
```

**Frontend** (typecheck + production build):
```bash
cd "apps/talk"
npm run typecheck
npm run build
```

---

## 5. Regenerating the API client (only if the backend API changes)

The typed client (`apps/talk/src/api/schema.d.ts`) is generated from the backend's
OpenAPI spec. If you change backend endpoints/models, refresh it:
```bash
# 1. export the schema from the backend
cd "services/api"
DATABASE_URL="sqlite+aiosqlite:///./_tmp.sqlite3" ./.venv/bin/python -c \
  "import json; from app.main import app; open('../../apps/talk/src/api/openapi.json','w').write(json.dumps(app.openapi(), indent=2))"
rm -f _tmp.sqlite3

# 2. regenerate the typed client
cd "../../apps/talk"
npm run generate:api
```

---

## Ports & environment reference

| What | Value |
|---|---|
| Backend | http://localhost:8000 (Swagger at `/docs`) |
| Frontend | http://localhost:5173/talk/ |
| `DATABASE_URL` | `sqlite+aiosqlite:///./billbeak.sqlite3` or `postgresql+asyncpg://billbeak:billbeak@localhost:5432/billbeak` |
| `VITE_API_URL` (frontend) | `http://localhost:8000` (default) |
| `CORS_ORIGINS` (backend) | `http://localhost:5173,http://localhost:4173` (default) |
| `UPLOAD_PROVIDER` | `local` (files land in `services/api/uploads/`) |

---

## Troubleshooting

- **Frontend shows "We couldn't reach Billbeak."** → the backend isn't running, or is on a
  different port. Start it on :8000 (or set `VITE_API_URL`) and click **Try again**.
- **CORS error in the browser console** → run the frontend on port 5173 or 4173, or add your
  origin to `CORS_ORIGINS` in `services/api/.env` and restart the backend.
- **`alembic upgrade head` fails / Postgres refused** → Postgres isn't running or the URL is
  wrong. Easiest fix: use the **SQLite** option (no DB to install).
- **`python3.13: command not found`** → install it (`brew install python@3.13`) or use your
  Python 3.13 path; `python3 --version` must be 3.13+.
- **Port already in use** → change the port (`--port 8001` for uvicorn, `npm run dev -- --port 5174`
  for Vite) and set `VITE_API_URL` accordingly.
- **Start over with clean data** → stop the backend and delete `services/api/billbeak.sqlite3`
  (SQLite) or `dropdb billbeak && createdb billbeak && alembic upgrade head` (Postgres).
- **404 at http://localhost:5173** → use the `/talk/` path: **http://localhost:5173/talk/**.
- **`npm install` reports vulnerabilities (esbuild / brace-expansion)** → these are **dev-only**
  dependencies (Vite's dev server and the OpenAPI codegen tool). They are **not** in the built
  app and are safe to ignore for local dev. **Do not run `npm audit fix --force`** — it makes
  breaking changes (downgrades `openapi-typescript`, jumps `vite` a major version). If you want
  the warnings gone without breakage, add `"overrides": { "brace-expansion": "^2.0.2" }` to
  `apps/talk/package.json` and re-run `npm install`.

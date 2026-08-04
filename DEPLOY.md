# Deploying Billbeak "Let's Talk"

Free-tier production stack:

```
Visitor ── talk.billbeak.com  (Cloudflare Pages · static React)
                 │  HTTPS
                 ▼
          Render  (FastAPI · Docker)
                 ├─▶ Neon           (Postgres, EU region)
                 └─▶ Cloudflare R2  (uploads, S3-compatible)

billbeak.com (marketing site) stays on AWS S3 — unchanged.
```

| Piece | Platform | Free tier notes |
|---|---|---|
| API | **Render** (Docker web service) | Sleeps after ~15 min idle (~50 s cold start). No card. |
| Postgres | **Neon** | Serverless, durable, autosuspends & resumes in ms. Pick an EU region. |
| Uploads | **AWS S3** (reuse existing account) | Private bucket in eu-north-1. Server-side puts via boto3. *(Cloudflare R2 also works but requires a card on file.)* |
| Frontend | **Cloudflare Pages** | Static + global CDN. |

You need GitHub (the repo), and free accounts on Render, Neon, and Cloudflare.

The repo already contains everything needed: `services/api/Dockerfile`, the R2-capable upload provider, and an env-driven frontend base path. The steps below are one-time dashboard setup.

---

## 1. Neon — Postgres

1. Create a project in an **EU region** (e.g. Frankfurt). Database name: `billbeak`.
2. Copy the connection string and convert it to the async form:
   ```
   DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>/<db>
   ```
   (Drop any `?sslmode=...` query param — TLS is handled by `DB_SSL=true`, see below.)

## 2. Object storage for uploads

Free hosts have ephemeral disks, so uploads must go to object storage. Uploads
flow **server-side** (browser → our API → storage via boto3), so the bucket stays
**private** and needs no CORS.

**Option A — AWS S3 (recommended; you already have AWS, no new card):**
1. Create a **private** bucket `billbeak-uploads` in **eu-north-1**.
2. Create an IAM user with a minimal policy (`s3:PutObject`, `s3:GetObject` on
   `arn:aws:s3:::billbeak-uploads/*`) → note its Access Key ID + Secret.
3. Render env: `UPLOAD_PROVIDER=s3`, `UPLOAD_BUCKET=billbeak-uploads`,
   `UPLOAD_S3_REGION=eu-north-1`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
   Leave `UPLOAD_S3_ENDPOINT` **unset**.

**Option B — Cloudflare R2** (S3-compatible, but requires a card on file):
1. Create bucket `billbeak-uploads`; create an S3 API token (key + secret); note the
   endpoint `https://<accountid>.r2.cloudflarestorage.com`.
2. Render env: `UPLOAD_PROVIDER=r2`, `UPLOAD_BUCKET=billbeak-uploads`,
   `UPLOAD_S3_ENDPOINT=<r2 endpoint>`, `UPLOAD_S3_REGION=auto`,
   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (the R2 token creds).

Either way the backend code is identical — only env vars differ.

## 3. Render — the API

**New → Web Service → Build from a Git repository** → select this repo.

- **Runtime:** Docker
- **Dockerfile Path:** `services/api/Dockerfile`
- **Root Directory / build context:** repo root (leave blank)
- **Instance type:** Free

**Environment variables:**

| Var | Value |
|---|---|
| `DATABASE_URL` | the Neon async URL from step 1 |
| `DB_SSL` | `true` |
| `UPLOAD_PROVIDER` | `s3` (or `r2`) |
| `UPLOAD_BUCKET` | `billbeak-uploads` |
| `UPLOAD_S3_REGION` | `eu-north-1` (S3) — or `auto` (R2) |
| `UPLOAD_S3_ENDPOINT` | *(unset for S3)* — R2: `https://<accountid>.r2.cloudflarestorage.com` |
| `AWS_ACCESS_KEY_ID` | S3/R2 access key |
| `AWS_SECRET_ACCESS_KEY` | S3/R2 secret |
| `CORS_ORIGINS` | `https://talk.billbeak.com` (add your `*.pages.dev` URL while setting up) |
| `ENVIRONMENT` | `production` |

Deploy. The container runs `alembic upgrade head` then starts uvicorn.
When it's live, verify: `https://<service>.onrender.com/health` and `/ready`.
(Optional: add a custom domain `api.billbeak.com`.)

## 4. Cloudflare Pages — the frontend

**Workers & Pages → Create → Pages → Connect to Git** → select this repo.

- **Root directory:** `apps/talk`
- **Build command:** `npm install && npm run build`
- **Build output directory:** `dist`

**Build environment variables:**

| Var | Value |
|---|---|
| `VITE_API_URL` | `https://<service>.onrender.com` (or `https://api.billbeak.com`) |
| `VITE_BASE` | `/` |

Deploy. Then **Custom domains → add `talk.billbeak.com`**.
Finally, set Render's `CORS_ORIGINS` to `https://talk.billbeak.com` and redeploy the API.

> The marketing site's "Let's Talk" button already points at `https://talk.billbeak.com` (`index.html`).

---

## Environment variable reference

Backend (Render) — see `services/api/.env.example` for the full list. Key ones:
`DATABASE_URL`, `DB_SSL`, `UPLOAD_PROVIDER`, `UPLOAD_BUCKET`, `UPLOAD_S3_ENDPOINT`, `UPLOAD_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CORS_ORIGINS`, `ENVIRONMENT`.

Frontend (Pages): `VITE_API_URL`, `VITE_BASE`.

---

## Gotchas

- **Uploads must be R2, never `local`.** Free hosts have an ephemeral filesystem — local files vanish on every redeploy/restart. The R2 provider is already built in.
- **Render free cold start (~50 s).** Optional keep-warm: a free pinger (UptimeRobot / cron-job.org) hitting `/health` every ~10 min. Stays within the 750 free hours/month for a single service.
- **Neon needs TLS** → `DB_SSL=true` (applies to both the app engine and Alembic).
- **`VITE_API_URL` is baked at build time.** If the API URL changes, trigger a Pages rebuild.
- **Data residency:** keep Neon, R2, and Render in EU regions to match the marketing site's `eu-north-1`.
- **Config is bundled in the image.** The Docker image copies `config/conversations/` next to the API so the loader finds it with no extra config.

---

## Verify end-to-end

1. `curl https://<render>/health` → `{"status":"ok"}`; `curl https://<render>/ready` → DB ok + `journeys: 7`.
2. Open `https://talk.billbeak.com/` → the welcome screen loads (confirms Pages build + `VITE_API_URL` + CORS).
3. Complete a journey **with a file upload** (Employer brief or Candidate CV).
4. Confirm persistence: in the Neon SQL editor, `select journey_key, status, lead_score from journey j join crm_event e on e.journey_id = j.id;` shows the completed journey; the R2 bucket contains the uploaded object.
5. `https://<render>/docs` (Swagger) renders.

---

## Redeploys

Both platforms auto-deploy on push to the connected branch:
- Push touching `services/api/**` or `config/**` → Render rebuilds the API image.
- Push touching `apps/talk/**` → Cloudflare Pages rebuilds the frontend.
- Push touching the marketing HTML/`assets/**` → the existing GitHub Action syncs to S3 (now scoped to marketing files only).

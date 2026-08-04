# Billbeak Let's Talk API — production image.
#
# Build context is the REPO ROOT (so we can bundle config/conversations alongside
# the service). On Render: Dockerfile Path = services/api/Dockerfile, root/context = repo root.
#
# The repo layout is replicated under /app so config.py's default config dir
# (<repo>/config/conversations, resolved as parents[3]) works with no CONFIG_DIR override.

FROM python:3.13-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Frozen business configuration (read at runtime by the loader).
COPY config /app/config

# The API service.
COPY services/api /app/services/api

# Install the app plus the [s3] extra (boto3) for Cloudflare R2 / S3 uploads.
RUN pip install "./services/api[s3]"

WORKDIR /app/services/api

# Render provides $PORT. Run migrations, then serve.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

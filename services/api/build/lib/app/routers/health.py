from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import __version__
from ..config_loader import get_config
from ..db import get_session
from ..schemas import HealthOut, ReadyOut

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthOut)
async def health() -> HealthOut:
    return HealthOut(status="ok", version=__version__)


@router.get("/ready", response_model=ReadyOut)
async def ready(session: AsyncSession = Depends(get_session)) -> ReadyOut:
    await session.execute(text("SELECT 1"))
    cfg = get_config()
    return ReadyOut(
        status="ready",
        database="ok",
        configuration=f"v{cfg.version}",
        journeys=len(cfg.journeys),
    )

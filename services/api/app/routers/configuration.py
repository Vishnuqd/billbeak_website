from __future__ import annotations

from fastapi import APIRouter

from ..config_loader import build_master_flow, get_config
from ..errors import NotFoundError
from ..schemas import ConfigurationOut, MasterConfigurationOut

router = APIRouter(prefix="/configuration", tags=["configuration"])


@router.get("", response_model=MasterConfigurationOut)
async def master_configuration() -> MasterConfigurationOut:
    """The whole composed conversation (root + navigator + every journey)."""
    cfg = get_config()
    flow, questions = build_master_flow(cfg)
    journeys = [
        {
            "key": jc.key,
            "name": jc.journey.get("name"),
            "journeyType": jc.journey_type,
            "priority": jc.journey.get("priority"),
            "entryNode": jc.entry_node,
        }
        for jc in cfg.journeys.values()
    ]
    return MasterConfigurationOut(
        version=cfg.version,
        intro=cfg.intro,
        navigator=cfg.navigator,
        flow=flow,
        questions=questions,
        journeys=journeys,
    )


@router.get("/{journey_key}", response_model=ConfigurationOut)
async def journey_configuration(journey_key: str) -> ConfigurationOut:
    cfg = get_config()
    jc = cfg.journey(journey_key)
    if jc is None:
        raise NotFoundError(f"Unknown journey '{journey_key}'.")
    return ConfigurationOut(
        journeyKey=jc.key,
        name=jc.journey.get("name", jc.key),
        version=jc.config_version,
        journeyType=jc.journey_type,
        flow=jc.flow,
        questions=jc.questions,
        confirmation=jc.confirmation,
        intro=cfg.intro,
    )

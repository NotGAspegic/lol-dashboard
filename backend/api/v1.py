from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from ..database import get_db_session, test_connection
    from ..ingestion.pipeline import ingest_summoner
    from ..models.db import Summoner
except ImportError:
    from database import get_db_session, test_connection
    from ingestion.pipeline import ingest_summoner
    from models.db import Summoner


logger = logging.getLogger(__name__)


router = APIRouter()


class SummonerResponse(BaseModel):
    """Public response model for stored summoner rows."""

    model_config = ConfigDict(from_attributes=True)

    puuid: str
    id: str | None
    profileIconId: int
    summonerLevel: int


class SummonerSearchRequest(BaseModel):
    """Input payload for background summoner ingestion requests."""

    game_name: str
    tag_line: str
    region: str


class SummonerSearchResponse(BaseModel):
    """Acknowledgement payload for background ingestion kickoff."""

    status: str
    game_name: str
    tag_line: str
    region: str


@router.get("/health")
async def health(request: Request) -> dict[str, Any]:
    """Actively test database and Redis connections for readiness."""
    try:
        await test_connection()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="database connection failed") from exc

    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is None:
        raise HTTPException(status_code=503, detail="redis client not initialized")

    try:
        redis_ok = await redis_client.ping()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="redis connection failed") from exc

    if not redis_ok:
        raise HTTPException(status_code=503, detail="redis ping failed")

    return {
        "status": "ok",
        "db": "connected",
        "redis": "connected",
    }


@router.get("/summoners/{puuid}", response_model=SummonerResponse)
async def get_summoner(
    puuid: str,
    session: AsyncSession = Depends(get_db_session),
) -> SummonerResponse:
    """Fetch and return a stored summoner row by puuid."""
    summoner = await session.scalar(select(Summoner).where(Summoner.puuid == puuid))
    if summoner is None:
        raise HTTPException(status_code=404, detail="summoner not found")
    return summoner


async def _run_summoner_ingestion(game_name: str, tag_line: str, region: str) -> None:
    """Run summoner ingestion in a background task and log failures."""
    try:
        await ingest_summoner(game_name=game_name, tag_line=tag_line, region=region)
        logger.info(
            "Background summoner ingestion completed (game_name=%s, tag_line=%s, region=%s)",
            game_name,
            tag_line,
            region,
        )
    except Exception:
        logger.exception(
            "Background summoner ingestion failed (game_name=%s, tag_line=%s, region=%s)",
            game_name,
            tag_line,
            region,
        )


@router.post(
    "/summoners/search",
    response_model=SummonerSearchResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def search_summoner(
    payload: SummonerSearchRequest,
) -> SummonerSearchResponse:
    """Start summoner ingestion in the background and return immediately."""
    asyncio.create_task(
        _run_summoner_ingestion(
            payload.game_name,
            payload.tag_line,
            payload.region,
        )
    )
    return SummonerSearchResponse(
        status="accepted",
        game_name=payload.game_name,
        tag_line=payload.tag_line,
        region=payload.region,
    )

from __future__ import annotations

import logging
import time
from typing import Any, Literal

from fastapi.responses import JSONResponse
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select,func, case
from models.db import Summoner, Match, MatchParticipant
from sqlalchemy.ext.asyncio import AsyncSession
from celery.result import AsyncResult

from utils.cache import cache_get, cache_set

try:
    from ..config import settings
    from ..database import get_db_session, test_connection
    from ..models.db import Summoner
    from ..riot.client import RiotClient
    from ..worker.celery_app import celery_app
    from ..worker.tasks.refresh import onboard_summoner, refresh_summoner
except ImportError:
    from config import settings
    from database import get_db_session, test_connection
    from models.db import Summoner
    from riot.client import RiotClient
    from worker.celery_app import celery_app
    from worker.tasks.refresh import onboard_summoner, refresh_summoner


logger = logging.getLogger(__name__)


router = APIRouter()


class SummonerResponse(BaseModel):
    """Public response model for stored summoner rows."""

    model_config = ConfigDict(from_attributes=True)

    puuid: str
    id: str | None
    profileIconId: int
    summonerLevel: int
    region: str | None = None


class SummonerSearchRequest(BaseModel):
    """Input payload for background summoner ingestion requests."""

    game_name: str
    tag_line: str
    region: str


class SummonerSearchResponse(BaseModel):
    """Acknowledgement payload for asynchronous Celery task kickoff."""

    status: str
    task_id: str
    task_type: str
    puuid: str
    game_name: str
    tag_line: str
    region: str


class TaskStatusResponse(BaseModel):
    """Current task status and terminal result payload from Celery backend."""

    status: Literal["PENDING", "STARTED", "SUCCESS", "FAILURE"]
    result: Any | None


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
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> SummonerResponse:
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"summoner:{puuid}"

    # try cache first
    if redis:
        t0 = time.perf_counter()
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            logger.debug("summoner served from cache in %.1fms", (time.perf_counter() - t0) * 1000)
            return SummonerResponse(**cached)

    # cache miss — hit DB
    t0 = time.perf_counter()
    summoner = await session.scalar(select(Summoner).where(Summoner.puuid == puuid))
    if summoner is None:
        raise HTTPException(status_code=404, detail="summoner not found")
    logger.debug("summoner loaded from DB in %.1fms", (time.perf_counter() - t0) * 1000)

    # store in cache
    if redis:
        payload = {
            "puuid": summoner.puuid,
            "id": summoner.id,
            "profileIconId": summoner.profileIconId,
            "summonerLevel": summoner.summonerLevel,
            "region": summoner.region,
        }
        await cache_set(redis, cache_key, payload, ttl=300)

    return summoner


def _normalize_regions(region: str) -> tuple[str, str]:
    """Return (regional_route, platform_route) for Riot API calls."""
    normalized_region = region.strip().lower()
    if not normalized_region:
        raise ValueError("region cannot be empty.")

    if normalized_region in {"americas", "asia", "europe", "sea"}:
        platform_region = settings.riot_platform.strip().lower()
    else:
        platform_region = normalized_region

    return normalized_region, platform_region


def _normalize_task_status(raw_status: str) -> Literal["PENDING", "STARTED", "SUCCESS", "FAILURE"]:
    """Map Celery status variants to frontend-facing polling states."""
    if raw_status == "SUCCESS":
        return "SUCCESS"
    if raw_status in {"STARTED", "RETRY", "RECEIVED"}:
        return "STARTED"
    if raw_status == "PENDING":
        return "PENDING"
    return "FAILURE"


def _serialize_task_result(value: Any) -> Any:
    """Convert task result/exception objects into JSON-safe payloads."""
    if value is None:
        return None

    try:
        return jsonable_encoder(value)
    except Exception:
        return str(value)


REFRESH_RATE_LIMIT_SECONDS = 300  # 5 minutes

@router.post(
    "/summoners/{puuid}/refresh",
    status_code=status.HTTP_202_ACCEPTED,
)
async def refresh_summoner_endpoint(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Manually trigger an incremental match refresh for a summoner."""
    summoner = await session.scalar(select(Summoner).where(Summoner.puuid == puuid))
    if summoner is None:
        raise HTTPException(status_code=404, detail="summoner not found")

    # Redis rate limit — max 1 refresh per summoner per 5 minutes
    redis_client = getattr(request.app.state, "redis", None)
    if redis_client is not None:
        rate_key = f"refresh_limit:{puuid}"
        already_refreshing = await redis_client.get(rate_key)
        if already_refreshing:
            raise HTTPException(
                status_code=429,
                detail="refresh already triggered recently, please wait 5 minutes",
            )
        await redis_client.setex(rate_key, REFRESH_RATE_LIMIT_SECONDS, "1")

    async_result = refresh_summoner.delay(puuid, summoner.region)

    logger.info(
        "Manual refresh triggered (puuid=%s, region=%s, task_id=%s)",
        puuid, summoner.region, async_result.id,
    )

    return JSONResponse(
        status_code=202,
        content={
            "status": "accepted",
            "task_id": async_result.id,
            "puuid": puuid,
        },
    )

@router.post(
    "/summoners/search",
    response_model=SummonerSearchResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def search_summoner(
    payload: SummonerSearchRequest,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Queue onboarding or refresh task and return task metadata immediately."""
    normalized_game_name = payload.game_name.strip()
    normalized_tag_line = payload.tag_line.strip()

    if not normalized_game_name:
        raise HTTPException(status_code=422, detail="game_name cannot be empty")
    if not normalized_tag_line:
        raise HTTPException(status_code=422, detail="tag_line cannot be empty")

    try:
        normalized_region, platform_region = _normalize_regions(payload.region)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        async with RiotClient(
            settings.riot_api_key.get_secret_value(),
            redis_url=settings.redis_url,
        ) as riot_client:
            summoner_dto = await riot_client.get_summoner_by_riot_id(
                game_name=normalized_game_name,
                tag_line=normalized_tag_line,
                region=platform_region,
            )
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 404:
            raise HTTPException(status_code=404, detail="summoner not found") from exc
        if status_code == 429:
            raise HTTPException(status_code=429, detail="riot rate limit exceeded") from exc
        if status_code is not None and 500 <= status_code < 600:
            raise HTTPException(status_code=503, detail="riot service unavailable") from exc
        raise HTTPException(status_code=502, detail="failed to resolve summoner") from exc

    existing_puuid = await session.scalar(
            select(Summoner.puuid).where(Summoner.puuid == summoner_dto.puuid)
        )

    if existing_puuid is not None:
        # already tracked — return stored data immediately as 200
        summoner = await session.scalar(
            select(Summoner).where(Summoner.puuid == summoner_dto.puuid)
        )
        return JSONResponse(
            status_code=200,
            content={
                "status": "ready",
                "puuid": summoner.puuid,
                "profileIconId": summoner.profileIconId,
                "summonerLevel": summoner.summonerLevel,
                "region": summoner.region,
            },
        )

    # new summoner — kick off onboarding
    async_result = onboard_summoner.delay(
        normalized_game_name,
        normalized_tag_line,
        normalized_region,
    )
    logger.info(
        "Queued onboard_summoner (game_name=%s, tag_line=%s, region=%s, puuid=%s, task_id=%s)",
        normalized_game_name, normalized_tag_line, normalized_region,
        summoner_dto.puuid, async_result.id,
    )
    return JSONResponse(
        status_code=202,
        content={
            "status": "onboarding",
            "task_id": async_result.id,
            "task_type": "onboard_summoner",
            "puuid": summoner_dto.puuid,
            "game_name": normalized_game_name,
            "tag_line": normalized_tag_line,
            "region": normalized_region,
        },
    )

STATUS_MESSAGES = {
    "PENDING":  "Fetching summoner data...",
    "STARTED":  "Ingesting match history...",
    "SUCCESS":  "Ready",
    "FAILURE":  "Error — please try again",
}

@router.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str) -> JSONResponse:
    async_result = AsyncResult(task_id, app=celery_app)
    normalized = _normalize_task_status(async_result.status)

    result = None
    if normalized in {"SUCCESS", "FAILURE"}:
        result = _serialize_task_result(async_result.result)

    return JSONResponse(content={
        "status": normalized,
        "message": STATUS_MESSAGES[normalized],
        "result": result,
    })


@router.get("/summoners/{puuid}/ingestion-status")
async def get_ingestion_status(
    puuid: str,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Return match count, last ingested timestamp, and pending task count."""
    from sqlalchemy import func, select as sa_select
    from models.db import Match, MatchParticipant

    summoner = await session.scalar(select(Summoner).where(Summoner.puuid == puuid))
    if summoner is None:
        raise HTTPException(status_code=404, detail="summoner not found")

    # total matches ingested for this summoner
    total_matches = await session.scalar(
        sa_select(func.count()).select_from(MatchParticipant)
        .where(MatchParticipant.puuid == puuid)
    )

    # most recent game start timestamp
    last_game_start = await session.scalar(
        sa_select(func.max(Match.gameStartTimestamp))
        .join(MatchParticipant, Match.gameId == MatchParticipant.gameId)
        .where(MatchParticipant.puuid == puuid)
    )

    # pending tasks — inspect active + reserved queues
    pending_count = 0
    try:
        inspect = celery_app.control.inspect(timeout=1.0)
        active   = inspect.active()   or {}
        reserved = inspect.reserved() or {}
        all_tasks = [
            t for worker_tasks in (*active.values(), *reserved.values())
            for t in worker_tasks
        ]
        pending_count = sum(
            1 for t in all_tasks
            if puuid in str(t.get("args", ""))
        )
    except Exception:
        pass  # inspect can fail if workers are busy — just return 0

    last_ingested = None
    if last_game_start:
        from datetime import datetime, timezone
        last_ingested = datetime.fromtimestamp(
            last_game_start / 1000, tz=timezone.utc
        ).isoformat()

    return JSONResponse(content={
        "puuid": puuid,
        "total_matches": total_matches or 0,
        "last_ingested": last_ingested,
        "pending_tasks": pending_count,
    })


@router.get("/summoners/{puuid}/matches")
async def get_matches(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    limit: int = 20,
    offset: int = 0,
) -> JSONResponse:
    """Paginated match history for a summoner."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"matches:{puuid}:{limit}:{offset}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    rows = await session.execute(
        select(
            MatchParticipant.gameId,
            MatchParticipant.championId,
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.win,
            MatchParticipant.individualPosition,
            MatchParticipant.challenges,
            Match.gameDuration,
            Match.gameStartTimestamp,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(MatchParticipant.puuid == puuid)
        .order_by(Match.gameStartTimestamp.desc())
        .limit(limit)
        .offset(offset)
    )

    matches = []
    for row in rows:
        challenges = row.challenges or {}
        matches.append({
            "gameId": row.gameId,
            "championId": row.championId,
            "kills": row.kills,
            "deaths": row.deaths,
            "assists": row.assists,
            "win": row.win,
            "individualPosition": row.individualPosition,
            "gameDuration": row.gameDuration,
            "gameStartTimestamp": row.gameStartTimestamp,
            "cs_per_min": round(challenges.get("cs_per_min", 0), 2),
        })

    if redis:
        await cache_set(redis, cache_key, matches, ttl=300)

    return JSONResponse(content=matches)


@router.get("/summoners/{puuid}/champion-stats")
async def get_champion_stats(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Aggregated per-champion stats for a summoner."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"champion_stats:{puuid}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    rows = await session.execute(
        select(
            MatchParticipant.championId,
            func.count().label("games"),
            func.avg(MatchParticipant.kills).label("avg_kills"),
            func.avg(MatchParticipant.deaths).label("avg_deaths"),
            func.avg(MatchParticipant.assists).label("avg_assists"),
            (
                func.avg(
                    case((MatchParticipant.win, 1.0), else_=0.0)
                ) * 100
            ).label("winrate"),
        )
        .where(MatchParticipant.puuid == puuid)
        .group_by(MatchParticipant.championId)
        .having(func.count() >= 3)
        .order_by(func.count().desc())
    )

    stats = []
    for row in rows:
        avg_deaths = float(row.avg_deaths) if row.avg_deaths else 1
        kda = round(
            (float(row.avg_kills) + float(row.avg_assists)) / max(avg_deaths, 1), 2
        )
        stats.append({
            "championId": row.championId,
            "games": row.games,
            "avg_kills": round(float(row.avg_kills), 1),
            "avg_deaths": round(float(row.avg_deaths), 1),
            "avg_assists": round(float(row.avg_assists), 1),
            "kda": kda,
            "winrate": round(float(row.winrate), 1),
        })

    if redis:
        await cache_set(redis, cache_key, stats, ttl=300)

    return JSONResponse(content=stats)


@router.get("/summoners/{puuid}/stats-overview")
async def get_stats_overview(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Overall performance summary for a summoner."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"stats_overview:{puuid}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    # overall aggregates
    agg = await session.execute(
        select(
            func.count().label("total_games"),
            (func.avg(case((MatchParticipant.win, 1.0), else_=0.0)) * 100).label("winrate"),
            func.avg(MatchParticipant.kills).label("avg_kills"),
            func.avg(MatchParticipant.deaths).label("avg_deaths"),
            func.avg(MatchParticipant.assists).label("avg_assists"),
        )
        .where(MatchParticipant.puuid == puuid)
    )
    agg_row = agg.one()

    # most played champion
    most_played = await session.scalar(
        select(MatchParticipant.championId)
        .where(MatchParticipant.puuid == puuid)
        .group_by(MatchParticipant.championId)
        .order_by(func.count().desc())
        .limit(1)
    )

    # win streak — fetch recent games ordered newest first
    recent = await session.execute(
        select(MatchParticipant.win)
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(MatchParticipant.puuid == puuid)
        .order_by(Match.gameStartTimestamp.desc())
        .limit(20)
    )
    recent_wins = [row.win for row in recent]
    win_streak = 0
    for w in recent_wins:
        if w:
            win_streak += 1
        else:
            break

    avg_deaths = float(agg_row.avg_deaths) if agg_row.avg_deaths else 1
    avg_kda = round(
        (float(agg_row.avg_kills or 0) + float(agg_row.avg_assists or 0))
        / max(avg_deaths, 1),
        2,
    )

    result = {
        "total_games": agg_row.total_games or 0,
        "winrate": round(float(agg_row.winrate or 0), 1),
        "avg_kda": avg_kda,
        "most_played_champion_id": most_played,
        "win_streak": win_streak,
    }

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)

@router.get("/summoners/{puuid}/kda-trend")
async def get_kda_trend(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    limit: int = 20,
) -> JSONResponse:
    """KDA trend for last N games in chronological order."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"kda_trend:{puuid}:{limit}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    rows = await session.execute(
        select(
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.win,
            MatchParticipant.championId,
            Match.gameStartTimestamp,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(MatchParticipant.puuid == puuid)
        .order_by(Match.gameStartTimestamp.desc())
        .limit(limit)
    )

    # reverse to chronological order (oldest first)
    games = list(rows)
    games.reverse()

    result = []
    for i, row in enumerate(games):
        kda = round(
            (row.kills + row.assists) / max(row.deaths, 1), 2
        )
        result.append({
            "game_index": i + 1,
            "kda": kda,
            "kills": row.kills,
            "deaths": row.deaths,
            "assists": row.assists,
            "win": row.win,
            "champion_id": row.championId,
            "game_start": row.gameStartTimestamp,
        })

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)


@router.get("/summoners/{puuid}/performance-scatter")
async def get_performance_scatter(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """All games as scatter plot data points."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"perf_scatter:{puuid}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    rows = await session.execute(
        select(
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.win,
            MatchParticipant.championId,
            MatchParticipant.challenges,
            Match.gameDuration,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(MatchParticipant.puuid == puuid)
        .order_by(Match.gameStartTimestamp.desc())
    )

    result = []
    for row in rows:
        kda = round((row.kills + row.assists) / max(row.deaths, 1), 2)
        challenges = row.challenges or {}
        damage_share = round(float(challenges.get("damage_share", 0)), 4)
        result.append({
            "kda": kda,
            "kills": row.kills,
            "deaths": row.deaths,
            "assists": row.assists,
            "damage_share": damage_share,
            "champion_id": row.championId,
            "win": row.win,
            "game_duration": row.gameDuration,
        })

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)
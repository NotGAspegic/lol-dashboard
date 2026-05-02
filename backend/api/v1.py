from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import time
from pathlib import Path
from typing import Any, Literal

from fastapi.responses import JSONResponse
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select,func, case, or_, text
from sqlalchemy.orm import aliased
from models.db import Summoner, Match, MatchParticipant, RankSnapshot
from sqlalchemy.ext.asyncio import AsyncSession
from celery.result import AsyncResult

from utils.cache import cache_get, cache_set
from utils.riot_identity import build_riot_id_slug, normalize_region_for_lookup

try:
    from ..config import settings
    from ..database import get_db_session, test_connection
    from ..db.ops import upsert_rank_snapshots
    from ..models.db import RankSnapshot, Summoner
    from ..ml.model_registry import (
        DRAFT_FEATURES_PATH,
        DRAFT_MODEL_PATH,
        TILT_FEATURES_PATH,
        TILT_MODEL_PATH,
        load_model_registry,
    )
    from ..ml.predictors.tilt_predictor import predict_tilt as run_tilt_prediction
    from ..ml.predictors.draft_predictor import predict_draft_win as run_draft_prediction
    from ..riot.client import RiotClient
    from ..worker.celery_app import celery_app
    from ..worker.tasks.refresh import onboard_summoner, refresh_summoner
except ImportError:
    from config import settings
    from database import get_db_session, test_connection
    from db.ops import upsert_rank_snapshots
    from models.db import RankSnapshot, Summoner
    from ml.model_registry import (
        DRAFT_FEATURES_PATH,
        DRAFT_MODEL_PATH,
        TILT_FEATURES_PATH,
        TILT_MODEL_PATH,
        load_model_registry,
    )
    from ml.predictors.tilt_predictor import predict_tilt as run_tilt_prediction
    from ml.predictors.draft_predictor import predict_draft_win as run_draft_prediction
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
    game_name: str | None = None
    tag_line: str | None = None
    riot_id_slug: str | None = None


class SummonerSuggestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    puuid: str
    profileIconId: int
    summonerLevel: int
    region: str | None = None
    game_name: str
    tag_line: str
    riot_id_slug: str


class SummonerSearchRequest(BaseModel):
    """Input payload for background summoner ingestion requests."""

    game_name: str
    tag_line: str
    region: str


class SummonerSearchResponse(BaseModel):
    """Acknowledgement payload for asynchronous Celery task kickoff."""

    status: str
    task_id: str | None = None
    task_type: str | None = None
    puuid: str
    game_name: str
    tag_line: str
    region: str


class TaskStatusResponse(BaseModel):
    """Current task status and terminal result payload from Celery backend."""

    status: Literal["PENDING", "STARTED", "SUCCESS", "FAILURE"]
    result: Any | None


class TiltPredictionResponse(BaseModel):
    """Tilt prediction payload for a summoner."""

    tilt_score: float | None
    tilt_level: str
    reasons: list[str]
    games_analyzed: int


class DraftPredictionRequest(BaseModel):
    """Input payload for draft win probability prediction."""

    puuid: str
    ally_champion_ids: list[int]
    enemy_champion_ids: list[int]
    player_champion_id: int

    @field_validator("ally_champion_ids", "enemy_champion_ids")
    @classmethod
    def validate_team_champion_ids(cls, value: list[int]) -> list[int]:
        if len(value) != 5:
            raise ValueError("must contain exactly 5 champion ids")
        if len(set(value)) != len(value):
            raise ValueError("must not contain duplicate champion ids")
        return value


class DraftPredictionResponse(BaseModel):
    """Draft win probability payload."""

    win_probability: float
    confidence: str
    player_champion_games: int
    player_champion_winrate: float
    note: str


class RankedTrendPoint(BaseModel):
    game_index: int
    net_wins: int
    win: bool
    game_start_timestamp: int


class RankedRecentSummary(BaseModel):
    games: int
    wins: int
    losses: int
    winrate: float
    avg_kda: float
    net_wins: int
    trend: list[RankedTrendPoint]


class RankedQueueSummary(BaseModel):
    queue_type: str
    tier: str
    rank: str | None = None
    league_points: int
    wins: int
    losses: int
    winrate: float
    hot_streak: bool = False
    veteran: bool = False
    fresh_blood: bool = False
    inactive: bool = False


class RankHistoryPoint(BaseModel):
    queue_type: str
    tier: str
    rank: str | None = None
    league_points: int
    wins: int
    losses: int
    captured_at: str


class RoleSummary(BaseModel):
    role: str
    games: int
    wins: int
    losses: int
    winrate: float
    avg_kda: float
    share: float


class RankedSummaryResponse(BaseModel):
    solo: RankedQueueSummary | None
    flex: RankedQueueSummary | None
    solo_source: str = "unavailable"
    flex_source: str = "unavailable"
    solo_history: list[RankHistoryPoint] = Field(default_factory=list)
    flex_history: list[RankHistoryPoint] = Field(default_factory=list)
    favorite_role: str | None = None
    top_roles: list[RoleSummary] = Field(default_factory=list)
    tracked_recent_30d: RankedRecentSummary | None
    live_rank_status: str = "unknown"
    live_rank_message: str = ""
    note: str


class ModelStatus(BaseModel):
    loaded: bool
    trained_at: str
    test_auc: float
    training_samples: int
    model_version: str


class MLStatusResponse(BaseModel):
    models: dict[str, ModelStatus]


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


@router.get("/summoners/suggest", response_model=list[SummonerSuggestionResponse])
async def suggest_summoners(
    query: str = Query(min_length=1),
    region: str | None = None,
    limit: int = Query(default=5, ge=1, le=10),
    session: AsyncSession = Depends(get_db_session),
) -> list[SummonerSuggestionResponse]:
    normalized_query = query.strip().lower()
    if len(normalized_query) < 2:
        return []

    riot_id_expr = func.concat(Summoner.game_name, "#", Summoner.tag_line)
    contains_pattern = f"%{normalized_query}%"
    prefix_pattern = f"{normalized_query}%"

    stmt = (
        select(Summoner)
        .where(
            Summoner.game_name.is_not(None),
            Summoner.tag_line.is_not(None),
            Summoner.riot_id_slug.is_not(None),
            or_(
                func.lower(Summoner.game_name).like(contains_pattern),
                func.lower(Summoner.tag_line).like(contains_pattern),
                func.lower(riot_id_expr).like(contains_pattern),
            ),
        )
        .order_by(
            case(
                (func.lower(riot_id_expr).like(prefix_pattern), 0),
                (func.lower(Summoner.game_name).like(prefix_pattern), 1),
                (func.lower(Summoner.tag_line).like(prefix_pattern), 2),
                else_=3,
            ),
            func.length(Summoner.game_name),
            Summoner.game_name.asc(),
        )
        .limit(limit)
    )

    if region:
        stmt = stmt.where(Summoner.region == normalize_region_for_lookup(region))

    result = await session.scalars(stmt)
    rows = result.all()
    return [
        SummonerSuggestionResponse(
            puuid=row.puuid,
            profileIconId=row.profileIconId,
            summonerLevel=row.summonerLevel,
            region=row.region,
            game_name=row.game_name or "",
            tag_line=row.tag_line or "",
            riot_id_slug=row.riot_id_slug or "",
        )
        for row in rows
    ]


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
            if cached.get("game_name") and cached.get("tag_line") and cached.get("riot_id_slug"):
                logger.debug("summoner served from cache in %.1fms", (time.perf_counter() - t0) * 1000)
                return SummonerResponse(**cached)
            logger.debug("summoner cache missing riot identity; falling back to DB")

    # cache miss — hit DB
    t0 = time.perf_counter()
    summoner = await session.scalar(select(Summoner).where(Summoner.puuid == puuid))
    if summoner is None:
        raise HTTPException(status_code=404, detail="summoner not found")
    logger.debug("summoner loaded from DB in %.1fms", (time.perf_counter() - t0) * 1000)

    if not summoner.game_name or not summoner.tag_line or not summoner.riot_id_slug:
        try:
            async with RiotClient(
                settings.riot_api_key.get_secret_value(),
                redis_url=settings.redis_url,
            ) as riot_client:
                account = await riot_client.get_account_by_puuid(
                    puuid=summoner.puuid,
                    region=summoner.region,
                )
            summoner.game_name = account.gameName
            summoner.tag_line = account.tagLine
            summoner.riot_id_slug = build_riot_id_slug(account.gameName, account.tagLine)
            await session.commit()
        except Exception:
            logger.warning("riot identity backfill failed for puuid=%s", puuid, exc_info=True)

    # store in cache
    if redis:
        payload = {
            "puuid": summoner.puuid,
            "id": summoner.id,
            "profileIconId": summoner.profileIconId,
            "summonerLevel": summoner.summonerLevel,
            "region": summoner.region,
            "game_name": summoner.game_name,
            "tag_line": summoner.tag_line,
            "riot_id_slug": summoner.riot_id_slug,
        }
        await cache_set(redis, cache_key, payload, ttl=300)

    return summoner


@router.get("/summoners/by-riot-id/{region}/{riot_id_slug}", response_model=SummonerResponse)
async def get_summoner_by_riot_id_slug(
    region: str,
    riot_id_slug: str,
    session: AsyncSession = Depends(get_db_session),
) -> SummonerResponse:
    normalized_region = normalize_region_for_lookup(region)
    normalized_slug = riot_id_slug.strip().lower()

    if not normalized_slug:
        raise HTTPException(status_code=404, detail="summoner not found")

    summoner = await session.scalar(
        select(Summoner).where(
            Summoner.region == normalized_region,
            func.lower(Summoner.riot_id_slug) == normalized_slug,
        )
    )
    if summoner is None:
        raise HTTPException(status_code=404, detail="summoner not found")

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

    async_result = refresh_summoner.delay(
        puuid,
        summoner.region,
        dispatch_queue="priority_ingestion",
    )

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
        existing_summoner = await session.scalar(
            select(Summoner).where(Summoner.puuid == summoner_dto.puuid)
        )
        if existing_summoner is not None:
            existing_summoner.game_name = summoner_dto.gameName or existing_summoner.game_name
            existing_summoner.tag_line = summoner_dto.tagLine or existing_summoner.tag_line
            if summoner_dto.gameName and summoner_dto.tagLine:
                existing_summoner.riot_id_slug = build_riot_id_slug(
                    summoner_dto.gameName,
                    summoner_dto.tagLine,
                )
            await session.commit()

        # already tracked — return stored data immediately as 200
        summoner = await session.scalar(select(Summoner).where(Summoner.puuid == summoner_dto.puuid))
        return JSONResponse(
            status_code=200,
            content={
                "status": "ready",
                "puuid": summoner.puuid,
                "profileIconId": summoner.profileIconId,
                "summonerLevel": summoner.summonerLevel,
                "region": summoner.region,
                "game_name": summoner.game_name or normalized_game_name,
                "tag_line": summoner.tag_line or normalized_tag_line,
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


@router.post(
    "/summoners/{puuid}/onboard",
    response_model=SummonerSearchResponse,
)
async def onboard_summoner_by_puuid(
    puuid: str,
    region: str = Query(..., min_length=1),
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Resolve a participant identity by puuid, then return ready/onboarding metadata."""
    normalized_puuid = puuid.strip()
    if not normalized_puuid:
        raise HTTPException(status_code=422, detail="puuid cannot be empty")

    try:
        normalized_region, platform_region = _normalize_regions(region)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    existing_summoner = await session.scalar(
        select(Summoner).where(Summoner.puuid == normalized_puuid)
    )
    if existing_summoner is not None:
        return JSONResponse(
            status_code=200,
            content={
                "status": "ready",
                "puuid": existing_summoner.puuid,
                "game_name": existing_summoner.game_name or "Unknown",
                "tag_line": existing_summoner.tag_line or "NA",
                "region": existing_summoner.region,
            },
        )

    try:
        async with RiotClient(
            settings.riot_api_key.get_secret_value(),
            redis_url=settings.redis_url,
        ) as riot_client:
            account = await riot_client.get_account_by_puuid(
                puuid=normalized_puuid,
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

    already_tracked = await session.scalar(
        select(Summoner).where(Summoner.puuid == normalized_puuid)
    )
    if already_tracked is not None:
        already_tracked.game_name = account.gameName or already_tracked.game_name
        already_tracked.tag_line = account.tagLine or already_tracked.tag_line
        if account.gameName and account.tagLine:
            already_tracked.riot_id_slug = build_riot_id_slug(account.gameName, account.tagLine)
        await session.commit()

        return JSONResponse(
            status_code=200,
            content={
                "status": "ready",
                "puuid": already_tracked.puuid,
                "game_name": already_tracked.game_name or account.gameName,
                "tag_line": already_tracked.tag_line or account.tagLine,
                "region": already_tracked.region,
            },
        )

    async_result = onboard_summoner.delay(
        account.gameName,
        account.tagLine,
        normalized_region,
    )
    logger.info(
        "Queued onboard_summoner from puuid (puuid=%s, game_name=%s, tag_line=%s, region=%s, task_id=%s)",
        normalized_puuid,
        account.gameName,
        account.tagLine,
        normalized_region,
        async_result.id,
    )
    return JSONResponse(
        status_code=202,
        content={
            "status": "onboarding",
            "task_id": async_result.id,
            "task_type": "onboard_summoner",
            "puuid": normalized_puuid,
            "game_name": account.gameName,
            "tag_line": account.tagLine,
            "region": normalized_region,
        },
    )

STATUS_MESSAGES = {
    "PENDING":  "Fetching summoner data...",
    "STARTED":  "Ingesting match history...",
    "SUCCESS":  "Ready",
    "FAILURE":  "Error — please try again",
}


def _tilt_level_from_score(score: float | None) -> str:
    if score is None:
        return "insufficient_data"
    if score >= 0.7:
        return "high"
    if score >= 0.4:
        return "moderate"
    return "low"


def _require_model_files(paths: list[Path]) -> None:
    missing = [str(path.name) for path in paths if not path.exists()]
    if missing:
        raise HTTPException(
            status_code=503,
            detail=f"missing model artifacts: {', '.join(missing)}",
        )


def _metadata_str(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _metadata_float(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)


def _metadata_int(value: Any) -> int:
    if value is None:
        return 0
    return int(value)


def _build_ranked_queue_summary(entry: Any) -> RankedQueueSummary:
    total_games = entry.wins + entry.losses
    winrate = (entry.wins / total_games * 100) if total_games else 0.0
    return RankedQueueSummary(
        queue_type=entry.queueType,
        tier=entry.tier,
        rank=entry.rank,
        league_points=entry.leaguePoints,
        wins=entry.wins,
        losses=entry.losses,
        winrate=round(winrate, 1),
        hot_streak=bool(entry.hotStreak),
        veteran=bool(entry.veteran),
        fresh_blood=bool(entry.freshBlood),
        inactive=bool(entry.inactive),
    )


def _build_ranked_queue_summary_from_snapshot(snapshot: Any) -> RankedQueueSummary:
    total_games = snapshot.wins + snapshot.losses
    winrate = (snapshot.wins / total_games * 100) if total_games else 0.0
    return RankedQueueSummary(
        queue_type=snapshot.queue_type,
        tier=snapshot.tier,
        rank=snapshot.rank,
        league_points=int(snapshot.league_points),
        wins=int(snapshot.wins),
        losses=int(snapshot.losses),
        winrate=round(winrate, 1),
        hot_streak=False,
        veteran=False,
        fresh_blood=False,
        inactive=False,
    )


def _build_rank_history_point(snapshot: RankSnapshot) -> RankHistoryPoint:
    return RankHistoryPoint(
        queue_type=snapshot.queue_type,
        tier=snapshot.tier,
        rank=snapshot.rank,
        league_points=int(snapshot.league_points),
        wins=int(snapshot.wins),
        losses=int(snapshot.losses),
        captured_at=snapshot.captured_at.isoformat(),
    )


def _normalize_role_label(team_position: str | None, individual_position: str | None) -> str | None:
    role = (team_position or individual_position or "").strip().upper()
    if role in {"TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"}:
        return role
    if role == "SUPPORT":
        return "UTILITY"
    return None


@router.get("/predict/tilt/{puuid}", response_model=TiltPredictionResponse)
async def predict_tilt_endpoint(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse | TiltPredictionResponse:
    """Return cached tilt risk prediction and plain-English reasons."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"tilt_prediction:{puuid}"

    if redis is not None:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return TiltPredictionResponse(**cached)

    try:
        _require_model_files(
            [
                TILT_MODEL_PATH,
                TILT_FEATURES_PATH,
            ]
        )
        prediction = await run_tilt_prediction(puuid, session)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("tilt prediction failed for puuid=%s", puuid)
        raise HTTPException(
            status_code=503,
            detail="Tilt prediction is temporarily unavailable.",
        ) from exc

    payload = TiltPredictionResponse(**prediction)

    if redis is not None:
        await cache_set(redis, cache_key, payload.model_dump(), ttl=1800)

    return payload


@router.get("/summoners/{puuid}/ranked-summary", response_model=RankedSummaryResponse)
async def get_ranked_summary(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> RankedSummaryResponse:
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"ranked_summary:{puuid}"

    if redis is not None:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return RankedSummaryResponse(**cached)

    summoner = await session.scalar(select(Summoner).where(Summoner.puuid == puuid))
    if summoner is None:
        raise HTTPException(status_code=404, detail="summoner not found")

    solo_summary: RankedQueueSummary | None = None
    flex_summary: RankedQueueSummary | None = None
    solo_source = "unavailable"
    flex_source = "unavailable"
    live_rank_status = "unknown"
    live_rank_message = "Live ranked data was not checked."

    if summoner.region:
        try:
            async with RiotClient(
                settings.riot_api_key.get_secret_value(),
                redis_url=settings.redis_url,
            ) as riot_client:
                entries = await riot_client.get_ranked_entries_by_puuid(
                    puuid=summoner.puuid,
                    region=summoner.region,
                )
        except Exception:
            logger.warning("ranked summary Riot fetch failed for puuid=%s", puuid, exc_info=True)
            entries = []
            live_rank_status = "riot_error"
            live_rank_message = "Riot live ranked lookup failed for this profile just now."
        else:
            live_rank_status = "no_entry"
            live_rank_message = "No current ranked solo or flex entry was returned by Riot for this profile."

        for entry in entries:
            if entry.queueType == "RANKED_SOLO_5x5":
                solo_summary = _build_ranked_queue_summary(entry)
                solo_source = "live"
            elif entry.queueType == "RANKED_FLEX_SR":
                flex_summary = _build_ranked_queue_summary(entry)
                flex_source = "live"

        if solo_summary or flex_summary:
            await upsert_rank_snapshots(session, puuid, entries)
            await session.commit()
            live_rank_status = "available"
            live_rank_message = "Live ranked queue data is available from Riot."
    else:
        live_rank_status = "missing_region"
        live_rank_message = "This profile is missing a platform region, so live ranked lookup could not run."

    snapshot_result = await session.execute(
        select(RankSnapshot)
        .where(RankSnapshot.puuid == puuid)
        .order_by(RankSnapshot.captured_at.desc())
    )
    snapshot_rows = snapshot_result.scalars().all()

    latest_solo_snapshot = next(
        (row for row in snapshot_rows if row.queue_type == "RANKED_SOLO_5x5"),
        None,
    )
    latest_flex_snapshot = next(
        (row for row in snapshot_rows if row.queue_type == "RANKED_FLEX_SR"),
        None,
    )

    if solo_summary is None and latest_solo_snapshot is not None:
        solo_summary = _build_ranked_queue_summary_from_snapshot(latest_solo_snapshot)
        solo_source = "snapshot"
    if flex_summary is None and latest_flex_snapshot is not None:
        flex_summary = _build_ranked_queue_summary_from_snapshot(latest_flex_snapshot)
        flex_source = "snapshot"

    solo_history = [
        _build_rank_history_point(snapshot)
        for snapshot in reversed(
            [row for row in snapshot_rows if row.queue_type == "RANKED_SOLO_5x5"][:16]
        )
    ]
    flex_history = [
        _build_rank_history_point(snapshot)
        for snapshot in reversed(
            [row for row in snapshot_rows if row.queue_type == "RANKED_FLEX_SR"][:16]
        )
    ]

    role_rows = await session.execute(
        select(
            MatchParticipant.teamPosition,
            MatchParticipant.individualPosition,
            MatchParticipant.win,
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(
            MatchParticipant.puuid == puuid,
            Match.queueId.in_([420, 440]),
        )
        .order_by(Match.gameStartTimestamp.desc())
        .limit(80)
    )

    role_buckets: dict[str, dict[str, float]] = {}
    total_role_games = 0
    for row in role_rows:
        role = _normalize_role_label(row.teamPosition, row.individualPosition)
        if role is None:
            continue
        bucket = role_buckets.setdefault(
            role,
            {"games": 0, "wins": 0, "kills": 0.0, "deaths": 0.0, "assists": 0.0},
        )
        bucket["games"] += 1
        bucket["wins"] += 1 if row.win else 0
        bucket["kills"] += float(row.kills)
        bucket["deaths"] += float(row.deaths)
        bucket["assists"] += float(row.assists)
        total_role_games += 1

    role_order = {"TOP": 0, "JUNGLE": 1, "MIDDLE": 2, "BOTTOM": 3, "UTILITY": 4}
    top_roles = [
        RoleSummary(
            role=role,
            games=int(bucket["games"]),
            wins=int(bucket["wins"]),
            losses=int(bucket["games"] - bucket["wins"]),
            winrate=round((bucket["wins"] / bucket["games"]) * 100, 1) if bucket["games"] else 0.0,
            avg_kda=round((bucket["kills"] + bucket["assists"]) / max(bucket["deaths"], 1.0), 2),
            share=round((bucket["games"] / total_role_games) * 100, 1) if total_role_games else 0.0,
        )
        for role, bucket in sorted(
            role_buckets.items(),
            key=lambda item: (-item[1]["games"], role_order.get(item[0], 99)),
        )
    ]
    favorite_role = top_roles[0].role if top_roles else None

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    cutoff_ms = int(cutoff.timestamp() * 1000)
    recent_rows = await session.execute(
        select(
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.win,
            Match.gameStartTimestamp,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(
            MatchParticipant.puuid == puuid,
            Match.gameStartTimestamp >= cutoff_ms,
            Match.queueId.in_([420, 440]),
        )
        .order_by(Match.gameStartTimestamp.asc())
    )

    recent_matches = recent_rows.all()
    tracked_recent_30d: RankedRecentSummary | None = None
    if recent_matches:
        wins = sum(1 for row in recent_matches if row.win)
        losses = len(recent_matches) - wins
        avg_kda = sum((row.kills + row.assists) / max(row.deaths, 1) for row in recent_matches) / len(recent_matches)
        trend_source = recent_matches[-12:]
        running_net_wins = 0
        trend: list[RankedTrendPoint] = []
        for index, row in enumerate(trend_source, start=1):
            running_net_wins += 1 if row.win else -1
            trend.append(
                RankedTrendPoint(
                    game_index=index,
                    net_wins=running_net_wins,
                    win=bool(row.win),
                    game_start_timestamp=int(row.gameStartTimestamp),
                )
            )

        tracked_recent_30d = RankedRecentSummary(
            games=len(recent_matches),
            wins=wins,
            losses=losses,
            winrate=round((wins / len(recent_matches)) * 100, 1),
            avg_kda=round(avg_kda, 2),
            net_wins=wins - losses,
            trend=trend,
        )

    payload = RankedSummaryResponse(
        solo=solo_summary,
        flex=flex_summary,
        solo_source=solo_source,
        flex_source=flex_source,
        solo_history=solo_history,
        flex_history=flex_history,
        favorite_role=favorite_role,
        top_roles=top_roles,
        tracked_recent_30d=tracked_recent_30d,
        live_rank_status=live_rank_status,
        live_rank_message=live_rank_message,
        note="Rank data comes from Riot live league entries. The 30d section reflects tracked ranked matches in your local history.",
    )

    if redis is not None:
        await cache_set(redis, cache_key, payload.model_dump(), ttl=600)

    return payload


@router.get("/ml/status", response_model=MLStatusResponse)
async def get_ml_status() -> MLStatusResponse:
    _require_model_files(
        [
            TILT_MODEL_PATH,
            TILT_FEATURES_PATH,
            DRAFT_MODEL_PATH,
            DRAFT_FEATURES_PATH,
        ]
    )

    try:
        registry = load_model_registry()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="failed to load model registry") from exc

    models = {
        model_name: ModelStatus(
            loaded=True,
            trained_at=_metadata_str(model_data["metadata"].get("trained_at")),
            test_auc=_metadata_float(model_data["metadata"].get("test_auc")),
            training_samples=_metadata_int(model_data["metadata"].get("training_samples")),
            model_version=_metadata_str(model_data["metadata"].get("model_version")) or model_name,
        )
        for model_name, model_data in registry.items()
    }

    return MLStatusResponse(models=models)


@router.post("/predict/draft", response_model=DraftPredictionResponse)
async def predict_draft_endpoint(
    payload: DraftPredictionRequest,
    session: AsyncSession = Depends(get_db_session),
) -> DraftPredictionResponse:
    if set(payload.ally_champion_ids).intersection(payload.enemy_champion_ids):
        raise HTTPException(
            status_code=422,
            detail="ally_champion_ids and enemy_champion_ids cannot share champions",
        )
    if payload.player_champion_id not in payload.ally_champion_ids:
        raise HTTPException(
            status_code=422,
            detail="player_champion_id must be included in ally_champion_ids",
        )

    try:
        _require_model_files(
            [
                DRAFT_MODEL_PATH,
                DRAFT_FEATURES_PATH,
            ]
        )
        prediction = await run_draft_prediction(
            puuid=payload.puuid,
            ally_champion_ids=payload.ally_champion_ids,
            enemy_champion_ids=payload.enemy_champion_ids,
            player_champion_id=payload.player_champion_id,
            session=session,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("draft prediction failed for puuid=%s", payload.puuid)
        raise HTTPException(
            status_code=503,
            detail="Draft prediction is temporarily unavailable.",
        ) from exc

    return DraftPredictionResponse(**prediction)

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


@router.get("/summoners/{puuid}/matchups")
async def get_matchups(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Return aggregated matchup stats vs enemy champions for the same position.

    Finds the lane opponent by self-joining match_participants: mp_player (filtered
    by puuid) joined to mp_enemy where gameId matches, individualPosition matches,
    and teamId differs. Aggregates by enemy champion and filters to >= 3 games.
    """
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"matchups:{puuid}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    mp_player = aliased(MatchParticipant, name="mp_player")
    mp_enemy = aliased(MatchParticipant, name="mp_enemy")

    stmt = (
        select(
            mp_enemy.championId.label("enemy_champion_id"),
            func.count().label("games"),
            func.sum(case((mp_player.win, 1), else_=0)).label("wins"),
            (func.avg(case((mp_player.win, 1.0), else_=0.0)) * 100).label("win_rate"),
            func.avg(
                (mp_player.kills + mp_player.assists) / func.greatest(mp_player.deaths, 1)
            ).label("avg_kda_in_matchup"),
        )
        .join(
            mp_enemy,
            (mp_player.gameId == mp_enemy.gameId)
            & (mp_player.individualPosition == mp_enemy.individualPosition)
            & (mp_player.teamId != mp_enemy.teamId),
        )
        .where(mp_player.puuid == puuid)
        .group_by(mp_enemy.championId)
        .having(func.count() >= 3)
        .order_by(func.count().desc())
    )

    rows = await session.execute(stmt)
    result = []
    for row in rows:
        result.append({
            "enemy_champion_id": row.enemy_champion_id,
            "games": int(row.games),
            "wins": int(row.wins),
            "win_rate": float(row.win_rate) if row.win_rate is not None else 0.0,
            "avg_kda_in_matchup": round(float(row.avg_kda_in_matchup or 0.0), 2),
        })

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

    # Add a 5-game rolling average so the trend line is less noisy.
    kda_values = [point["kda"] for point in result]
    for i, point in enumerate(result):
        window = kda_values[max(0, i - 4): i + 1]
        point["rolling_avg"] = round(sum(window) / len(window), 2)

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


@router.get("/summoners/{puuid}/gold-curves")
async def get_gold_curves(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    champion_id: int | None = None,
) -> JSONResponse:
    """Average gold per minute curve across all games for a summoner."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"gold_curves:{puuid}:{champion_id}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    # build the raw SQL — ROW_NUMBER reconstructs participant_id (1-10)
    # from insertion order, which matches Riot API participant order
    champion_filter = ""
    params: dict = {"puuid": puuid}

    if champion_id is not None:
        champion_filter = 'AND mp."championId" = :champion_id'
        params["champion_id"] = champion_id

    sql = text(f"""
        WITH ranked_participants AS (
            SELECT
                mp."gameId",
                mp.puuid,
                ROW_NUMBER() OVER (
                    PARTITION BY mp."gameId" ORDER BY mp.id ASC
                ) AS participant_id
            FROM match_participants mp
            JOIN matches m ON m."gameId" = mp."gameId"
            WHERE mp.puuid = :puuid
              AND m."gameDuration" >= 300
              {champion_filter}
        )
        SELECT
            tf.minute,
            ROUND(AVG(tf.total_gold)::numeric, 0) AS avg_gold
        FROM match_timeline_frames tf
        JOIN ranked_participants rp
            ON tf.match_id = rp."gameId"
            AND tf.participant_id = rp.participant_id
        WHERE tf.minute <= 35
        GROUP BY tf.minute
        ORDER BY tf.minute ASC
    """)

    rows = await session.execute(sql, params)
    result = [
        {"minute": row.minute, "avg_gold": int(row.avg_gold)}
        for row in rows
    ]

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)


@router.get("/summoners/{puuid}/vision-impact")
async def get_vision_impact(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Win rate by vision score quartile."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"vision_impact:{puuid}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    vision_sql = text("""
        WITH quartiled AS (
            SELECT
                win,
                "visionScore",
                NTILE(4) OVER (ORDER BY "visionScore") AS quartile
            FROM match_participants
            WHERE puuid = :puuid
        )
        SELECT
            quartile,
            ROUND(AVG("visionScore")::numeric, 1) AS avg_vision,
            ROUND(AVG(CASE WHEN win THEN 1.0 ELSE 0.0 END) * 100, 1) AS win_rate,
            COUNT(*) AS game_count
        FROM quartiled
        GROUP BY quartile
        ORDER BY quartile
    """)

    rows = await session.execute(vision_sql, {"puuid": puuid})

    labels = ["Low Vision", "Below Avg", "Above Avg", "High Vision"]
    result = [
        {
            "quartile": row.quartile,
            "label": labels[row.quartile - 1],
            "avg_vision": float(row.avg_vision),
            "win_rate": float(row.win_rate),
            "game_count": row.game_count,
        }
        for row in rows
    ]

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)

@router.get("/summoners/{puuid}/damage-efficiency")
async def get_damage_efficiency(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Per-game damage share vs gold share for efficiency analysis."""
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"damage_efficiency:{puuid}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)
        
    efficiency_sql = text("""
            WITH team_gold AS (
                SELECT
                    "gameId",
                    "teamId",
                    SUM("goldEarned") AS total_team_gold
                FROM match_participants
                GROUP BY "gameId", "teamId"
            ),
            player_games AS (
                SELECT
                    mp."gameId",
                    mp.win,
                    mp."championId",
                    (mp.challenges->>'damage_share')::float AS damage_share,
                    mp."goldEarned"::float / NULLIF(tg.total_team_gold, 0) AS gold_share
                FROM match_participants mp
                JOIN team_gold tg
                    ON tg."gameId" = mp."gameId"
                    AND tg."teamId" = mp."teamId"
                WHERE mp.puuid = :puuid
                AND mp.challenges->>'damage_share' IS NOT NULL
            ),
            median_cte AS (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
                    ORDER BY damage_share
                ) AS median_ds
                FROM player_games
            )
            SELECT
                pg."gameId",
                pg.win,
                pg."championId",
                ROUND(pg.damage_share::numeric, 4) AS damage_share,
                ROUND(pg.gold_share::numeric, 4)   AS gold_share,
                ROUND(m.median_ds::numeric, 4)     AS median_damage_share,
                CASE
                    WHEN pg.damage_share >= m.median_ds AND pg.win      THEN 'high_dmg_win'
                    WHEN pg.damage_share >= m.median_ds AND NOT pg.win  THEN 'high_dmg_loss'
                    WHEN pg.damage_share <  m.median_ds AND pg.win      THEN 'low_dmg_win'
                    ELSE 'low_dmg_loss'
                END AS bucket
            FROM player_games pg
            CROSS JOIN median_cte m
            ORDER BY pg."gameId" DESC
        """)

    rows = await session.execute(efficiency_sql, {"puuid": puuid})
    games = []
    bucket_counts: dict[str, int] = {
        "high_dmg_win": 0,
        "high_dmg_loss": 0,
        "low_dmg_win": 0,
        "low_dmg_loss": 0,
    }

    median_damage_share = None

    for row in rows:
        if median_damage_share is None:
            median_damage_share = float(row.median_damage_share)

        bucket_counts[row.bucket] += 1
        games.append({
            "gameId": row.gameId,
            "win": row.win,
            "championId": row.championId,
            "damage_share": float(row.damage_share),
            "gold_share": float(row.gold_share) if row.gold_share else 0.0,
            "bucket": row.bucket,
        })

    # efficiency score — % of games above the diagonal (dmg > gold share)
    above_diagonal = sum(
        1 for g in games if g["damage_share"] > g["gold_share"]
    )
    efficiency_score = round(
        (above_diagonal / len(games) * 100) if games else 0, 1
    )

    result = {
        "games": games,
        "bucket_counts": bucket_counts,
        "median_damage_share": median_damage_share,
        "efficiency_score": efficiency_score,
        "total_games": len(games),
    }

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)


def _normalize_value(value: float, min_val: float, max_val: float) -> float:
    """Min-max normalize a value to 0-100."""
    if value <= min_val:
        return 0.0
    if value >= max_val:
        return 100.0
    return ((value - min_val) / (max_val - min_val)) * 100.0


@router.get("/summoners/{puuid}/playstyle")
async def get_playstyle(
    puuid: str,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Return 6 normalized playstyle scores (0-100) representing player fingerprint.
    
    Axes:
    - Aggression: normalized avg kills/game (0=0 kills, 100=15+ kills)
    - Farming: normalized avg cs_per_min (0=3, 100=10)
    - Vision: normalized avg vision score (0=0, 100=60+)
    - Objective Control: normalized avg kill participation (0=0%, 100=100%)
    - Teamfight: normalized avg assists/game (0=0, 100=20+)
    - Consistency: 100 - (stddev of KDA × 10) — lower variance = higher score
    """
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"playstyle:{puuid}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    # Fetch all match data with team info
    rows = await session.execute(
        select(
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.challenges,
            MatchParticipant.visionScore,
            MatchParticipant.gameId,
            MatchParticipant.teamId,
            Match.gameDuration,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(MatchParticipant.puuid == puuid)
        .where(Match.gameDuration >= 300)  # Filter out remakes
    )

    games = list(rows)
    if not games:
        # Return neutral scores if no games
        result = {
            "aggression": 50,
            "farming": 50,
            "vision": 50,
            "objective_control": 50,
            "teamfight": 50,
            "consistency": 50,
        }
        if redis:
            await cache_set(redis, cache_key, result, ttl=600)
        return JSONResponse(content=result)

    # Calculate basic averages
    avg_kills = sum(g.kills for g in games) / len(games)
    avg_assists = sum(g.assists for g in games) / len(games)
    avg_vision = sum(g.visionScore or 0 for g in games) / len(games)

    # Extract cs_per_min from challenges JSONB
    cs_per_min_values = []
    for g in games:
        challenges = g.challenges or {}
        cs_pm = float(challenges.get("cs_per_min", 0))
        cs_per_min_values.append(cs_pm)
    avg_cs_per_min = sum(cs_per_min_values) / len(cs_per_min_values) if cs_per_min_values else 0

    # Calculate KDA values for consistency metric
    kdas = []
    for g in games:
        kda = (g.kills + g.assists) / max(g.deaths, 1)
        kdas.append(kda)

    avg_kda = sum(kdas) / len(kdas) if kdas else 0

    # Calculate KDA standard deviation for consistency
    if len(kdas) > 1:
        variance = sum((kda - avg_kda) ** 2 for kda in kdas) / len(kdas)
        stddev = variance ** 0.5
    else:
        stddev = 0

    # Fetch team kills per game for kill participation calculation
    game_ids = [g.gameId for g in games]
    team_stats = {}
    if game_ids:
        team_rows = await session.execute(
            select(
                MatchParticipant.gameId,
                MatchParticipant.teamId,
                func.sum(MatchParticipant.kills).label("team_kills"),
            )
            .where(MatchParticipant.gameId.in_(game_ids))
            .group_by(MatchParticipant.gameId, MatchParticipant.teamId)
        )
        for row in team_rows:
            team_stats[(row.gameId, row.teamId)] = float(row.team_kills or 1)

    # Calculate average kill participation
    kill_participations = []
    for g in games:
        team_kills = team_stats.get((g.gameId, g.teamId), 1.0)
        player_contrib = g.kills + g.assists
        participation = (player_contrib / max(team_kills, 1)) * 100
        kill_participations.append(participation)

    avg_kill_participation = (
        sum(kill_participations) / len(kill_participations)
        if kill_participations
        else 0
    )

    # Normalize all scores to 0-100
    aggression = _normalize_value(avg_kills, 0, 15)
    farming = _normalize_value(avg_cs_per_min, 3, 10)
    vision = _normalize_value(avg_vision, 0, 60)
    objective_control = _normalize_value(avg_kill_participation, 0, 100)
    teamfight = _normalize_value(avg_assists, 0, 20)

    # Consistency: lower stddev = higher consistency
    consistency = max(0, min(100, 100 - (stddev * 10)))

    result = {
        "aggression": round(aggression, 1),
        "farming": round(farming, 1),
        "vision": round(vision, 1),
        "objective_control": round(objective_control, 1),
        "teamfight": round(teamfight, 1),
        "consistency": round(consistency, 1),
    }

    if redis:
        await cache_set(redis, cache_key, result, ttl=600)

    return JSONResponse(content=result)


@router.get("/matches/{game_id}")
async def get_match_detail(
    game_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Return full match detail with all 10 participants grouped by team.
    
    Includes: puuid, championId, kills, deaths, assists, goldEarned, 
    totalDamageDealtToChampions, visionScore, individualPosition, win,
    cs_per_min, damage_share, kill_participation.
    """
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"match_detail:{game_id}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    # Fetch match metadata
    match = await session.scalar(select(Match).where(Match.gameId == game_id))
    if match is None:
        raise HTTPException(status_code=404, detail="match not found")

    # Fetch all 10 participants
    participants_rows = await session.execute(
        select(
            MatchParticipant.puuid,
            MatchParticipant.championId,
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.goldEarned,
            MatchParticipant.totalDamageDealtToChampions,
            MatchParticipant.visionScore,
            MatchParticipant.individualPosition,
            MatchParticipant.teamId,
            MatchParticipant.win,
            MatchParticipant.challenges,
        )
        .where(MatchParticipant.gameId == game_id)
        .order_by(MatchParticipant.teamId)
    )

    all_participants = list(participants_rows)
    if not all_participants:
        raise HTTPException(status_code=404, detail="match participants not found")

    # Calculate team kills for kill participation
    team_kills = {}
    for p in all_participants:
        team_id = p.teamId
        if team_id not in team_kills:
            team_kills[team_id] = 0
        team_kills[team_id] += p.kills

    # Format participants and group by team
    blue_team = []
    red_team = []
    objective_totals = {
        100: {
            "dragons": 0,
            "barons": 0,
            "heralds": 0,
            "elders": 0,
            "turrets": 0,
            "plates": 0,
            "first_turret": False,
        },
        200: {
            "dragons": 0,
            "barons": 0,
            "heralds": 0,
            "elders": 0,
            "turrets": 0,
            "plates": 0,
            "first_turret": False,
        },
    }

    for p in all_participants:
        challenges = p.challenges or {}
        cs_pm = float(challenges.get("cs_per_min", 0))
        damage_share = float(challenges.get("damage_share", 0))
        team_k = team_kills.get(p.teamId, 1)
        kill_part = ((p.kills + p.assists) / max(team_k, 1)) * 100
        objective_bucket = objective_totals.setdefault(
            p.teamId,
            {
                "dragons": 0,
                "barons": 0,
                "heralds": 0,
                "elders": 0,
                "turrets": 0,
                "plates": 0,
                "first_turret": False,
            },
        )
        objective_bucket["dragons"] = max(
            int(objective_bucket["dragons"]),
            int(challenges.get("teamDragonKills", challenges.get("dragonTakedowns", 0)) or 0),
        )
        objective_bucket["barons"] = max(
            int(objective_bucket["barons"]),
            int(challenges.get("teamBaronKills", challenges.get("baronTakedowns", 0)) or 0),
        )
        objective_bucket["heralds"] = max(
            int(objective_bucket["heralds"]),
            int(challenges.get("teamRiftHeraldKills", challenges.get("riftHeraldTakedowns", 0)) or 0),
        )
        objective_bucket["elders"] = max(
            int(objective_bucket["elders"]),
            int(challenges.get("teamElderDragonKills", 0) or 0),
        )
        objective_bucket["turrets"] = max(
            int(objective_bucket["turrets"]),
            int(challenges.get("turretTakedowns", 0) or 0),
        )
        objective_bucket["plates"] = max(
            int(objective_bucket["plates"]),
            int(challenges.get("turretPlatesTaken", 0) or 0),
        )
        objective_bucket["first_turret"] = bool(
            objective_bucket["first_turret"]
            or challenges.get("firstTurretKilled", 0)
            or challenges.get("takedownOnFirstTurret", 0)
        )

        participant_data = {
            "puuid": p.puuid,
            "championId": p.championId,
            "kills": p.kills,
            "deaths": p.deaths,
            "assists": p.assists,
            "goldEarned": p.goldEarned,
            "totalDamageDealtToChampions": p.totalDamageDealtToChampions,
            "visionScore": p.visionScore,
            "individualPosition": p.individualPosition,
            "win": p.win,
            "cs_per_min": round(cs_pm, 2),
            "damage_share": round(damage_share, 4),
            "kill_participation": round(kill_part, 1),
        }

        if p.teamId == 100:
            blue_team.append(participant_data)
        else:
            red_team.append(participant_data)

    result = {
        "blue_team": blue_team,
        "red_team": red_team,
        "match": {
            "duration": match.gameDuration,
            "patch": getattr(match, "patch", None),
            "game_start_timestamp": match.gameStartTimestamp,
            "winning_team": next((p.teamId for p in all_participants if p.win), None),
        },
        "objectives": {
            "blue": objective_totals.get(100, {}),
            "red": objective_totals.get(200, {}),
        },
    }

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)


@router.get("/matches/{game_id}/gold-diff")
async def get_match_gold_diff(
    game_id: int,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    """Return gold difference between teams at each minute.
    
    Positive = blue team (100) leading. Computed from match_timeline_frames.
    """
    redis = getattr(request.app.state, "redis", None)
    cache_key = f"match_gold_diff:{game_id}"

    if redis:
        cached = await cache_get(redis, cache_key)
        if cached is not None:
            return JSONResponse(content=cached)

    # Verify match exists
    match = await session.scalar(select(Match).where(Match.gameId == game_id))
    if match is None:
        raise HTTPException(status_code=404, detail="match not found")

    # Get participant IDs so we can map frames to teams
    participants = await session.execute(
        select(
            MatchParticipant.id,
            MatchParticipant.teamId,
        )
        .where(MatchParticipant.gameId == game_id)
    )
    
    team_map = {}  # participant_id -> teamId
    for p in participants:
        team_map[p.id] = p.teamId

    # Fetch timeline frames (we need participant_id → teamId mapping)
    sql = text("""
        SELECT
            tf.minute,
            SUM(CASE WHEN mp."teamId" = 100 THEN tf.total_gold ELSE 0 END) AS blue_gold,
            SUM(CASE WHEN mp."teamId" = 200 THEN tf.total_gold ELSE 0 END) AS red_gold
        FROM match_timeline_frames tf
        JOIN match_participants mp ON mp.id = tf.participant_id
        WHERE tf.match_id = :game_id
        GROUP BY tf.minute
        ORDER BY tf.minute ASC
    """)

    rows = await session.execute(sql, {"game_id": game_id})
    result = []
    for row in rows:
        blue_g = float(row.blue_gold or 0)
        red_g = float(row.red_gold or 0)
        gold_diff = blue_g - red_g
        result.append({
            "minute": int(row.minute),
            "blue_gold": blue_g,
            "red_gold": red_g,
            "gold_diff": gold_diff,
        })

    if redis:
        await cache_set(redis, cache_key, result, ttl=300)

    return JSONResponse(content=result)

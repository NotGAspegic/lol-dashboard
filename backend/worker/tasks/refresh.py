import asyncio
import logging
from typing import Any

import httpx
from celery import shared_task
from sqlalchemy import select

from config import settings
from database_sync import SyncSessionFactory
from db.ops_sync import upsert_summoner_sync
from models.db import Summoner
from models.riot_dtos import SummonerDTO
from riot.client import RiotClient
from worker.tasks.ingest import ingest_summoner_matches

from datetime import datetime, timedelta, timezone


logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RATE_LIMIT_RETRY_DELAY_SECONDS = 30
SERVER_ERROR_RETRY_DELAY_SECONDS = 60


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


@shared_task(
    bind=True,
    name="worker.tasks.refresh.refresh_summoner",
    max_retries=MAX_RETRIES,
    default_retry_delay=RATE_LIMIT_RETRY_DELAY_SECONDS,
)
def refresh_summoner(
    self,
    puuid: str,
    region: str,
    count: int = 20,
    queue: int = 420,
) -> dict[str, Any]:
    """Refresh profile data and trigger incremental match fanout from stored cursor."""
    normalized_puuid = puuid.strip()
    normalized_region, platform_region = _normalize_regions(region)

    if not normalized_puuid:
        raise ValueError("puuid cannot be empty.")
    if count < 1 or count > 100:
        raise ValueError("count must be between 1 and 100.")
    if queue < 0:
        raise ValueError("queue must be >= 0.")

    with SyncSessionFactory() as session:
        stored_cursor = session.scalar(
            select(Summoner.match_history_cursor).where(Summoner.puuid == normalized_puuid)
        )

    async def _fetch_summoner_profile() -> SummonerDTO:
        async with RiotClient(
            settings.riot_api_key.get_secret_value(),
            redis_url=settings.redis_url,
        ) as riot_client:
            return await riot_client.get_summoner_by_puuid(
                puuid=normalized_puuid,
                region=platform_region,
            )

    try:
        summoner_dto = asyncio.run(_fetch_summoner_profile())
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 404:
            logger.warning(
                "Riot returned HTTP 404 for summoner refresh; skipping without retry "
                "(puuid=%s, platform_region=%s)",
                normalized_puuid,
                platform_region,
            )
            return {
                "puuid": normalized_puuid,
                "region": normalized_region,
                "platform_region": platform_region,
                "since_match_id": stored_cursor,
                "dispatched": False,
                "not_found": True,
            }
        if status_code == 429:
            countdown = RATE_LIMIT_RETRY_DELAY_SECONDS
            logger.warning(
                "HTTP 429 during refresh_summoner; retrying "
                "(puuid=%s, platform_region=%s, retry=%s, countdown=%s)",
                normalized_puuid,
                platform_region,
                self.request.retries + 1,
                countdown,
            )
            raise self.retry(exc=exc, countdown=countdown)
        if status_code is not None and 500 <= status_code < 600:
            countdown = SERVER_ERROR_RETRY_DELAY_SECONDS
            logger.warning(
                "Riot server error during refresh_summoner; retrying "
                "(puuid=%s, platform_region=%s, status=%s, retry=%s/%s, countdown=%s)",
                normalized_puuid,
                platform_region,
                status_code,
                self.request.retries + 1,
                MAX_RETRIES,
                countdown,
            )
            raise self.retry(exc=exc, countdown=countdown, max_retries=MAX_RETRIES)
        raise

    if summoner_dto.puuid != normalized_puuid:
        raise ValueError(
            f"Summoner refresh puuid mismatch: requested {normalized_puuid}, received {summoner_dto.puuid}."
        )

    with SyncSessionFactory() as session:
        upsert_summoner_sync(session, summoner_dto , region=normalized_region)
        session.commit()

    fanout_async = ingest_summoner_matches.apply_async(
        args=[normalized_puuid, normalized_region],
        kwargs={
            "count": count,
            "queue": queue,
            "since_match_id": stored_cursor,
        },
        queue="ingestion",
    )

    logger.info(
        "Refreshed summoner profile and dispatched incremental fanout "
        "(puuid=%s, region=%s, platform_region=%s, since_match_id=%s, fanout_task_id=%s)",
        normalized_puuid,
        normalized_region,
        platform_region,
        stored_cursor,
        fanout_async.id,
    )

    # invalidate cached summoner data so next read is fresh
    try:
        import redis as redis_sync
        r = redis_sync.from_url(settings.redis_url, decode_responses=True)
        r.delete(f"summoner:{normalized_puuid}")

        cursor = 0
        while True:
            cursor, keys = r.scan(cursor, match=f"matches:{normalized_puuid}:*", count=100)
            if keys:
                r.delete(*keys)
            if cursor == 0:
                break

        r.close()
        logger.debug("Cache invalidated for puuid=%s", normalized_puuid)
    except Exception:
        logger.warning("Cache invalidation failed for puuid=%s", normalized_puuid, exc_info=True)


    # invalidate stats caches
    keys_to_delete = [
        f"champion_stats:{normalized_puuid}",
        f"stats_overview:{normalized_puuid}",
    ]
    for key in keys_to_delete:
        r.delete(key)

    # wipe all match list pages
    cursor = 0
    while True:
        cursor, keys = r.scan(cursor, match=f"matches:{normalized_puuid}:*", count=100)
        if keys:
            r.delete(*keys)
        if cursor == 0:
            break

    return {
        "puuid": normalized_puuid,
        "region": normalized_region,
        "platform_region": platform_region,
        "since_match_id": stored_cursor,
        "fanout_task_id": fanout_async.id,
        "dispatched": True,
        "profile": {
            "id": summoner_dto.id,
            "profileIconId": summoner_dto.profileIconId,
            "summonerLevel": summoner_dto.summonerLevel,
        },
    }
    



@shared_task(
    bind=True,
    name="worker.tasks.refresh.onboard_summoner",
    max_retries=MAX_RETRIES,
    default_retry_delay=RATE_LIMIT_RETRY_DELAY_SECONDS,
)
def onboard_summoner(
    self,
    game_name: str,
    tag_line: str,
    region: str,
    queue: int = 420,
) -> dict[str, Any]:
    """Run first-time onboarding by dispatching a full 100-match fanout without a cursor."""
    normalized_game_name = game_name.strip()
    normalized_tag_line = tag_line.strip()
    normalized_region, platform_region = _normalize_regions(region)

    if not normalized_game_name:
        raise ValueError("game_name cannot be empty.")
    if not normalized_tag_line:
        raise ValueError("tag_line cannot be empty.")
    if queue < 0:
        raise ValueError("queue must be >= 0.")

    async def _fetch_summoner_profile() -> SummonerDTO:
        async with RiotClient(
            settings.riot_api_key.get_secret_value(),
            redis_url=settings.redis_url,
        ) as riot_client:
            return await riot_client.get_summoner_by_riot_id(
                game_name=normalized_game_name,
                tag_line=normalized_tag_line,
                region=platform_region,
            )

    try:
        summoner_dto = asyncio.run(_fetch_summoner_profile())
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 404:
            logger.warning(
                "Riot returned HTTP 404 for summoner onboarding; skipping without retry "
                "(game_name=%s, tag_line=%s, platform_region=%s)",
                normalized_game_name,
                normalized_tag_line,
                platform_region,
            )
            return {
                "game_name": normalized_game_name,
                "tag_line": normalized_tag_line,
                "region": normalized_region,
                "platform_region": platform_region,
                "dispatched": False,
                "not_found": True,
            }
        if status_code == 429:
            countdown = RATE_LIMIT_RETRY_DELAY_SECONDS
            logger.warning(
                "HTTP 429 during onboard_summoner; retrying "
                "(game_name=%s, tag_line=%s, platform_region=%s, retry=%s, countdown=%s)",
                normalized_game_name,
                normalized_tag_line,
                platform_region,
                self.request.retries + 1,
                countdown,
            )
            raise self.retry(exc=exc, countdown=countdown)
        if status_code is not None and 500 <= status_code < 600:
            countdown = SERVER_ERROR_RETRY_DELAY_SECONDS
            logger.warning(
                "Riot server error during onboard_summoner; retrying "
                "(game_name=%s, tag_line=%s, platform_region=%s, status=%s, retry=%s/%s, countdown=%s)",
                normalized_game_name,
                normalized_tag_line,
                platform_region,
                status_code,
                self.request.retries + 1,
                MAX_RETRIES,
                countdown,
            )
            raise self.retry(exc=exc, countdown=countdown, max_retries=MAX_RETRIES)
        raise

    with SyncSessionFactory() as session:
        existing_puuid = session.scalar(
            select(Summoner.puuid).where(Summoner.puuid == summoner_dto.puuid)
        )
        if existing_puuid is not None:
            logger.info(
                "Skipping onboard_summoner; summoner already tracked "
                "(puuid=%s, region=%s)",
                summoner_dto.puuid,
                normalized_region,
            )
            return {
                "puuid": summoner_dto.puuid,
                "region": normalized_region,
                "platform_region": platform_region,
                "already_tracked": True,
                "dispatched": False,
            }

        upsert_summoner_sync(session, summoner_dto , region=normalized_region)
        session.commit()

    fanout_async = ingest_summoner_matches.apply_async(
        args=[summoner_dto.puuid, normalized_region],
        kwargs={
            "count": 100,
            "queue": queue,
            "since_match_id": None,
        },
        queue="ingestion",
    )

    logger.info(
        "Onboarded summoner and dispatched full fanout "
        "(puuid=%s, region=%s, platform_region=%s, requested_count=%s, fanout_task_id=%s)",
        summoner_dto.puuid,
        normalized_region,
        platform_region,
        100,
        fanout_async.id,
    )

    return {
        "puuid": summoner_dto.puuid,
        "region": normalized_region,
        "platform_region": platform_region,
        "requested_count": 100,
        "fanout_task_id": fanout_async.id,
        "already_tracked": False,
        "dispatched": True,
        "profile": {
            "id": summoner_dto.id,
            "profileIconId": summoner_dto.profileIconId,
            "summonerLevel": summoner_dto.summonerLevel,
        },
    }


@shared_task(
    name="worker.tasks.refresh.refresh_all_tracked_summoners",
)
def refresh_all_tracked_summoners() -> dict[str, Any]:
    """Periodic task: fan out a refresh_summoner job for every tracked summoner."""
    six_hours_ago = datetime.now(timezone.utc) - timedelta(hours=6)

    with SyncSessionFactory() as db:
        rows = db.execute(
            select(Summoner.puuid, Summoner.region).where(
                Summoner.last_updated < six_hours_ago
            )
        ).all()

    if not rows:
        logger.info("refresh_all_tracked_summoners: no summoners to refresh")
        return {"dispatched": 0}

    for i, (puuid, region) in enumerate(rows):
        refresh_summoner.apply_async(
            args=[puuid, region],
            countdown=i * 10,
            queue="refresh",
        )

    logger.info(
        "refresh_all_tracked_summoners dispatched %s refresh jobs", len(rows)
    )
    return {"dispatched": len(rows)}
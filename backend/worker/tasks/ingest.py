import asyncio
import logging
from typing import Any

import httpx
from celery import shared_task
from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from celery.exceptions import MaxRetriesExceededError
from models.db import FailedIngestion
from datetime import datetime

from config import settings
from database_sync import SyncSessionFactory
from db.ops_sync import (
    upsert_match_sync,
    upsert_participants_sync,
    upsert_timeline_frames_sync,
)
from models.db import Match, Summoner
from models.riot_dtos import MatchDTO, ParticipantFrameDTO, TimelineFrameDTO
from riot.client import RiotClient
from riot.client import RiotMatchNotFoundError
from riot.rate_limiter import RiotDualBucketRateLimiter
from riot.client import RiotRateLimitedError


logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RATE_LIMIT_RETRY_DELAY_SECONDS = 30
SERVER_ERROR_RETRY_DELAY_SECONDS = 60


def _extract_game_id(match_id: str) -> int:
    """Extract integer game ID from Riot match IDs like NA1_5531823714."""
    candidate = match_id.strip()
    if not candidate:
        raise ValueError("match_id cannot be empty.")

    numeric_part = candidate.rsplit("_", maxsplit=1)[-1]
    if not numeric_part.isdigit():
        raise ValueError(
            "match_id must end with a numeric game ID (example: NA1_5531823714)."
        )
    return int(numeric_part)


def _match_exists_sync(session: Session, game_id: int) -> bool:
    existing_match_id = session.scalar(
        select(Match.gameId).where(Match.gameId == game_id)
    )
    return existing_match_id is not None


async def _acquire_rate_limit_slot(
    rate_limiter: RiotDualBucketRateLimiter,
    region: str,
) -> None:
    """Block until the configured limiter allows a request for the region scope."""
    scope = region.strip().lower()
    while True:
        decision = await rate_limiter.acquire(scope)
        if decision.allowed:
            return

        wait_seconds = max(decision.retry_after_ms, 1) / 1000
        await asyncio.sleep(wait_seconds)


def _validate_timeline_payload(timeline_payload: dict[str, Any]) -> dict[str, Any]:
    """Validate timeline frames and participant frame records using project DTOs."""
    info = timeline_payload.get("info")
    if not isinstance(info, dict):
        raise ValueError("Timeline payload missing 'info' object.")

    frames = info.get("frames")
    if not isinstance(frames, list):
        raise ValueError("Timeline payload missing 'info.frames' list.")

    normalized_frames: list[dict[str, Any]] = []

    for frame_index, frame in enumerate(frames):
        if not isinstance(frame, dict):
            raise ValueError(f"Timeline frame at index {frame_index} must be an object.")

        timestamp = frame.get("timestamp")
        if not isinstance(timestamp, int):
            raise ValueError(
                f"Timeline frame at index {frame_index} is missing integer 'timestamp'."
            )

        participant_frames_raw = frame.get("participantFrames")
        if not isinstance(participant_frames_raw, (dict, list)):
            raise ValueError(
                f"Timeline frame at index {frame_index} has invalid 'participantFrames'."
            )

        if isinstance(participant_frames_raw, dict):
            participant_items = participant_frames_raw.items()
        else:
            participant_items = (
                (None, participant_frame) for participant_frame in participant_frames_raw
            )

        participant_frames_payload: list[dict[str, Any]] = []
        for participant_key, participant_frame in participant_items:
            if not isinstance(participant_frame, dict):
                raise ValueError(
                    f"participantFrames entry in frame {frame_index} must be an object."
                )

            candidate_payload = dict(participant_frame)
            if candidate_payload.get("participantId") is None and participant_key is not None:
                candidate_payload["participantId"] = int(participant_key)

            participant_dto = ParticipantFrameDTO.model_validate(candidate_payload)
            participant_frames_payload.append(participant_dto.model_dump())

        frame_dto = TimelineFrameDTO.model_validate(
            {"participantFrames": participant_frames_payload}
        )
        normalized_frames.append(
            {
                "timestamp": timestamp,
                "participantFrames": [
                    participant_frame.model_dump()
                    for participant_frame in frame_dto.participantFrames
                ],
            }
        )

    return {"frames": normalized_frames}


def _ingest_match_on_failure(self, exc, task_id, args, kwargs, einfo):
    """Write a dead letter record when ingest_match exhausts all retries."""
    if not isinstance(exc, MaxRetriesExceededError):
        return  # only record final failures, not intermediate retries

    match_id = args[0] if args else "unknown"
    region   = args[1] if len(args) > 1 else "unknown"

    try:
        with SyncSessionFactory() as session:
            session.add(FailedIngestion(
                match_id=match_id,
                region=region,
                error_type=type(exc.__cause__).__name__ if exc.__cause__ else type(exc).__name__,
                error_message=str(exc.__cause__ or exc)[:1024],
                attempts=MAX_RETRIES + 1,
            ))
            session.commit()
        logger.error(
            "ingest_match dead-lettered after %s attempts (match_id=%s, region=%s)",
            MAX_RETRIES + 1, match_id, region,
        )
    except Exception:
        logger.exception(
            "Failed to write dead letter record (match_id=%s, region=%s)",
            match_id, region,
        )


@shared_task(
    bind=True,
    name="worker.tasks.ingest.ingest_match",
    max_retries=MAX_RETRIES,
    default_retry_delay=RATE_LIMIT_RETRY_DELAY_SECONDS,
    on_failure=_ingest_match_on_failure,
)
def ingest_match(
    self,
    match_id: str,
    region: str,
    refresh_existing: bool = False,
) -> dict[str, Any]:
    """Fetch, validate, and persist a single match as the core ingestion unit."""
    game_id = _extract_game_id(match_id)
    normalized_region = region.strip().lower()
    if not normalized_region:
        raise ValueError("region cannot be empty.")

    # Step 1: check if match_id already exists in DB.
    with SyncSessionFactory() as check_session:
        match_exists = _match_exists_sync(check_session, game_id)
        if match_exists and not refresh_existing:
            logger.info(
                "Skipping ingest task; match already exists "
                "(match_id=%s, game_id=%s, region=%s)",
                match_id,
                game_id,
                normalized_region,
            )
            return {
                "match_id": match_id,
                "region": normalized_region,
                "inserted": False,
                "skipped": True,
                "refreshed": False,
            }

    async def _fetch_match_and_timeline() -> tuple[dict[str, Any], dict[str, Any]]:
        redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
        rate_limiter = RiotDualBucketRateLimiter(redis_client)
        try:
            await _acquire_rate_limit_slot(rate_limiter, normalized_region)
            async with RiotClient(
                settings.riot_api_key.get_secret_value(),
                rate_limiter=rate_limiter,
            ) as riot_client:
                match_payload = await riot_client.get_match(match_id, normalized_region)
                timeline_payload = await riot_client.get_timeline(match_id, normalized_region)
            return match_payload, timeline_payload
        finally:
            await redis_client.aclose()

    try:
        # Steps 2-5 are wrapped together in one try/except:
        # 2) call rate_limiter.acquire(region)
        # 3) fetch match + timeline via RiotClient
        # 4) validate with DTOs
        # 5) write to DB via sync SQLAlchemy upsert ops
        match_payload, timeline_payload = asyncio.run(_fetch_match_and_timeline())

        match_dto = MatchDTO.model_validate(match_payload)
        validated_timeline = _validate_timeline_payload(timeline_payload)

        if match_dto.info.gameId != game_id:
            raise ValueError(
                f"Match ID mismatch: requested {game_id}, received {match_dto.info.gameId}."
            )

        with SyncSessionFactory() as session:
            inserted = upsert_match_sync(session, match_dto)
            refreshed = False
            if not inserted and not refresh_existing:
                session.rollback()
                return {
                    "match_id": match_id,
                    "region": normalized_region,
                    "inserted": False,
                    "skipped": True,
                    "refreshed": False,
                }
            if not inserted and refresh_existing:
                refreshed = True

            upsert_participants_sync(session, game_id, match_dto.participants)
            upsert_timeline_frames_sync(session, game_id, validated_timeline)

            # Step 6: commit.
            session.commit()
    except RiotRateLimitedError as exc:
        countdown = 2 ** self.request.retries * 30
        logger.warning(
            "Rate limited during task ingest_match; retrying "
            "(match_id=%s, region=%s, retry=%s, countdown=%s)",
            match_id,
            normalized_region,
            self.request.retries + 1,
            countdown,
        )
        raise self.retry(exc=exc, countdown=countdown)
    except RiotMatchNotFoundError:
        logger.warning(
            "Match or timeline not found on Riot; skipping without retry "
            "(match_id=%s, region=%s)",
            match_id,
            normalized_region,
        )
        return {
            "match_id": match_id,
            "region": normalized_region,
            "inserted": False,
            "skipped": True,
            "not_found": True,
            "refreshed": False,
        }
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 404:
            logger.warning(
                "Riot returned HTTP 404; skipping without retry "
                "(match_id=%s, region=%s)",
                match_id,
                normalized_region,
            )
            return {
                "match_id": match_id,
                "region": normalized_region,
                "inserted": False,
                "skipped": True,
                "not_found": True,
                "refreshed": False,
            }
        if status_code == 429:
            retry_after = exc.response.headers.get("Retry-After")
            countdown = int(retry_after) if retry_after and retry_after.isdigit() \
                        else 2 ** self.request.retries * 30
            logger.warning(
                "HTTP 429 during task ingest_match; retrying "
                "(match_id=%s, region=%s, retry=%s, countdown=%s)",
                match_id,
                normalized_region,
                self.request.retries + 1,
                countdown,
            )
            raise self.retry(exc=exc, countdown=countdown)
        if status_code is not None and 500 <= status_code < 600:
            countdown = 2 ** self.request.retries * 30
            logger.warning(
                "Riot server error during task ingest_match; retrying "
                "(match_id=%s, region=%s, status=%s, retry=%s/%s, countdown=%s)",
                match_id,
                normalized_region,
                status_code,
                self.request.retries + 1,
                MAX_RETRIES,
                countdown,
            )
            raise self.retry(
                exc=exc,
                countdown=countdown,
                max_retries=MAX_RETRIES,
            )
        raise

    return {
        "match_id": match_id,
        "region": normalized_region,
        "inserted": inserted,
        "skipped": False,
        "refreshed": refreshed,
    }


@shared_task(
    bind=True,
    name="worker.tasks.ingest.ingest_summoner_matches",
    max_retries=MAX_RETRIES,
    default_retry_delay=RATE_LIMIT_RETRY_DELAY_SECONDS,
)
def ingest_summoner_matches(
    self,
    puuid: str,
    region: str,
    count: int = 20,
    queue: int = 420,
    since_match_id: str | None = None,
    include_existing: bool = False,
) -> dict[str, Any]:
    """Orchestrate match ingestion by dispatching one task per new match ID.

    This task intentionally does not fetch match payloads. It only:
    1) fetches recent match IDs,
    2) filters out IDs already in DB,
    3) dispatches ingest_match subtasks for the remaining IDs.
    """

    normalized_puuid = puuid.strip()
    normalized_region = region.strip().lower()

    if not normalized_puuid:
        raise ValueError("puuid cannot be empty.")
    if not normalized_region:
        raise ValueError("region cannot be empty.")
    if count < 1 or count > 100:
        raise ValueError("count must be between 1 and 100.")
    if queue < 0:
        raise ValueError("queue must be >= 0.")

    normalized_since_match_id: str | None = None
    if since_match_id is not None:
        normalized_since_match_id = since_match_id.strip()
        if not normalized_since_match_id:
            raise ValueError("since_match_id cannot be empty when provided.")

    async def _fetch_match_ids() -> list[str]:
        async with RiotClient(
            settings.riot_api_key.get_secret_value(),
            redis_url=settings.redis_url,
        ) as riot_client:
            return await riot_client.get_match_ids(
                puuid=normalized_puuid,
                region=normalized_region,
                count=count,
                queue=queue,
            )

    try:
        fetched_match_ids = asyncio.run(_fetch_match_ids())
    except RiotRateLimitedError as exc:
        countdown = RATE_LIMIT_RETRY_DELAY_SECONDS
        logger.warning(
            "Rate limited during ingest_summoner_matches; retrying "
            "(puuid=%s, region=%s, retry=%s, countdown=%s)",
            normalized_puuid,
            normalized_region,
            self.request.retries + 1,
            countdown,
        )
        raise self.retry(exc=exc, countdown=countdown)
    except httpx.HTTPStatusError as exc:
        status_code = exc.response.status_code if exc.response is not None else None
        if status_code == 404:
            logger.warning(
                "Riot returned HTTP 404 for match ID list; skipping without retry "
                "(puuid=%s, region=%s)",
                normalized_puuid,
                normalized_region,
            )
            return {
                "puuid": normalized_puuid,
                "region": normalized_region,
                "requested_count": count,
                "queue": queue,
                "fetched_match_count": 0,
                "new_match_count": 0,
                "dispatched_count": 0,
                "not_found": True,
                "dispatched_tasks": [],
            }
        if status_code == 429:
            countdown = RATE_LIMIT_RETRY_DELAY_SECONDS
            logger.warning(
                "HTTP 429 during ingest_summoner_matches; retrying "
                "(puuid=%s, region=%s, retry=%s, countdown=%s)",
                normalized_puuid,
                normalized_region,
                self.request.retries + 1,
                countdown,
            )
            raise self.retry(exc=exc, countdown=countdown)
        if status_code is not None and 500 <= status_code < 600:
            countdown = SERVER_ERROR_RETRY_DELAY_SECONDS
            logger.warning(
                "Riot server error during ingest_summoner_matches; retrying "
                "(puuid=%s, region=%s, status=%s, retry=%s/%s, countdown=%s)",
                normalized_puuid,
                normalized_region,
                status_code,
                self.request.retries + 1,
                MAX_RETRIES,
                countdown,
            )
            raise self.retry(exc=exc, countdown=countdown, max_retries=MAX_RETRIES)
        raise

    cursor_found = False
    candidate_match_ids = fetched_match_ids
    if normalized_since_match_id is not None:
        try:
            cursor_index = fetched_match_ids.index(normalized_since_match_id)
            candidate_match_ids = fetched_match_ids[:cursor_index]
            cursor_found = True
        except ValueError:
            # Cursor not present in the fetched window; treat all fetched IDs as candidates.
            candidate_match_ids = fetched_match_ids
            logger.info(
                "since_match_id not found in fetched window; using full fetched set "
                "(puuid=%s, region=%s, since_match_id=%s, fetched_count=%s)",
                normalized_puuid,
                normalized_region,
                normalized_since_match_id,
                len(fetched_match_ids),
            )

    ordered_game_ids: list[int] = []
    game_id_to_match_id: dict[int, str] = {}

    for candidate_match_id in candidate_match_ids:
        try:
            candidate_game_id = _extract_game_id(candidate_match_id)
        except ValueError:
            logger.warning(
                "Skipping malformed match ID while orchestrating ingestion "
                "(puuid=%s, region=%s, match_id=%s)",
                normalized_puuid,
                normalized_region,
                candidate_match_id,
            )
            continue

        if candidate_game_id not in game_id_to_match_id:
            ordered_game_ids.append(candidate_game_id)
            game_id_to_match_id[candidate_game_id] = candidate_match_id

    existing_game_ids: set[int] = set()
    if ordered_game_ids:
        with SyncSessionFactory() as session:
            existing_game_ids = set(
                session.scalars(
                    select(Match.gameId).where(Match.gameId.in_(ordered_game_ids))
                ).all()
            )

    if include_existing:
        target_match_ids = [game_id_to_match_id[game_id] for game_id in ordered_game_ids]
    else:
        target_match_ids = [
            game_id_to_match_id[game_id]
            for game_id in ordered_game_ids
            if game_id not in existing_game_ids
        ]

    dispatched_tasks: list[dict[str, str]] = []
    for i, target_match_id in enumerate(target_match_ids):
        countdown = i * 3
        async_result = ingest_match.apply_async(
            args=[target_match_id, normalized_region],
            kwargs={"refresh_existing": include_existing},
            countdown=countdown,
            queue="ingestion",
        )
        dispatched_tasks.append(
            {
                "match_id": target_match_id,
                "task_id": async_result.id,
                "countdown": str(countdown),
            }
        )

    new_match_ids = [
        game_id_to_match_id[game_id]
        for game_id in ordered_game_ids
        if game_id not in existing_game_ids
    ]
    newest_match_id_in_batch = new_match_ids[0] if new_match_ids else None
    cursor_updated = False
    if newest_match_id_in_batch is not None:
        with SyncSessionFactory() as session:
            update_result = session.execute(
                update(Summoner)
                .where(Summoner.puuid == normalized_puuid)
                .values(match_history_cursor=newest_match_id_in_batch)
            )
            session.commit()
            updated_rows = update_result.rowcount if update_result.rowcount is not None else 0
            cursor_updated = updated_rows > 0

        if not cursor_updated:
            logger.warning(
                "No summoner row updated for cursor save "
                "(puuid=%s, region=%s, cursor=%s)",
                normalized_puuid,
                normalized_region,
                newest_match_id_in_batch,
            )

    logger.info(
        "Dispatched ingest_match subtasks (puuid=%s, region=%s, requested_count=%s, "
        "fetched=%s, candidate=%s, existing=%s, dispatched=%s, include_existing=%s, "
        "since_match_id=%s, cursor_found=%s, newest_match_id_in_batch=%s, cursor_updated=%s)",
        normalized_puuid,
        normalized_region,
        count,
        len(fetched_match_ids),
        len(candidate_match_ids),
        len(existing_game_ids),
        len(dispatched_tasks),
        include_existing,
        normalized_since_match_id,
        cursor_found,
        newest_match_id_in_batch,
        cursor_updated,
    )

    return {
        "puuid": normalized_puuid,
        "region": normalized_region,
        "requested_count": count,
        "queue": queue,
        "include_existing": include_existing,
        "since_match_id": normalized_since_match_id,
        "cursor_found": cursor_found,
        "fetched_match_count": len(fetched_match_ids),
        "candidate_match_count": len(candidate_match_ids),
        "new_match_count": len(new_match_ids),
        "dispatched_count": len(dispatched_tasks),
        "newest_match_id_in_batch": newest_match_id_in_batch,
        "cursor_updated": cursor_updated,
        "dispatched_tasks": dispatched_tasks,
    }








@shared_task(
    name="worker.tasks.ingest.retry_failed_ingestions",
)
def retry_failed_ingestions() -> dict[str, Any]:
    """Periodic task: re-dispatch failed ingestions that are less than 7 days old."""
    from datetime import timezone, timedelta
    from sqlalchemy import delete

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    with SyncSessionFactory() as session:
        rows = session.execute(
            select(FailedIngestion).where(FailedIngestion.failed_at >= cutoff)
        ).scalars().all()

        if not rows:
            logger.info("retry_failed_ingestions: nothing to retry")
            return {"retried": 0, "expired_deleted": 0}

        for i, record in enumerate(rows):
            ingest_match.apply_async(
                args=[record.match_id, record.region],
                countdown=i * 5,
                queue="ingestion",
            )

        # delete retried rows — if they fail again they'll be re-written by on_failure
        retried_ids = [r.id for r in rows]
        session.execute(
            delete(FailedIngestion).where(FailedIngestion.id.in_(retried_ids))
        )

        # also clean up records older than 7 days
        expired = session.execute(
            delete(FailedIngestion).where(FailedIngestion.failed_at < cutoff)
        ).rowcount

        session.commit()

    logger.info(
        "retry_failed_ingestions: retried=%s expired_deleted=%s",
        len(rows), expired,
    )
    return {"retried": len(rows), "expired_deleted": expired}

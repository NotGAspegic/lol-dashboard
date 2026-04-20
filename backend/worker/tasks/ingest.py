import asyncio
import logging
from typing import Any

import httpx
from celery import shared_task
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.orm import Session

from config import settings
from database_sync import SyncSessionFactory
from db.ops_sync import (
    upsert_match_sync,
    upsert_participants_sync,
    upsert_timeline_frames_sync,
)
from models.db import Match
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


@shared_task(
    bind=True,
    name="worker.tasks.ingest.ingest_match",
    max_retries=MAX_RETRIES,
    default_retry_delay=RATE_LIMIT_RETRY_DELAY_SECONDS,
)
def ingest_match(self, match_id: str, region: str) -> dict[str, Any]:
    """Fetch, validate, and persist a single match as the core ingestion unit."""
    game_id = _extract_game_id(match_id)
    normalized_region = region.strip().lower()
    if not normalized_region:
        raise ValueError("region cannot be empty.")

    # Step 1: check if match_id already exists in DB.
    with SyncSessionFactory() as check_session:
        if _match_exists_sync(check_session, game_id):
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
            if not inserted:
                session.rollback()
                return {
                    "match_id": match_id,
                    "region": normalized_region,
                    "inserted": False,
                    "skipped": True,
                }

            upsert_participants_sync(session, game_id, match_dto.participants)
            upsert_timeline_frames_sync(session, game_id, validated_timeline)

            # Step 6: commit.
            session.commit()
    except RiotRateLimitedError as exc:
        countdown = RATE_LIMIT_RETRY_DELAY_SECONDS
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
            }
        if status_code == 429:
            countdown = RATE_LIMIT_RETRY_DELAY_SECONDS
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
            countdown = SERVER_ERROR_RETRY_DELAY_SECONDS
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
        "inserted": True,
        "skipped": False,
    }
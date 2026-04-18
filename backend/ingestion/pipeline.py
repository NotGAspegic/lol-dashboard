from __future__ import annotations

import asyncio
from collections.abc import Callable
import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import AsyncSessionFactory
from db.ops import upsert_match, upsert_participants, upsert_summoner, upsert_timeline_frames
from models.db import Match
from models.riot_dtos import MatchDTO, ParticipantFrameDTO, TimelineFrameDTO
from riot.client import RiotClient


logger = logging.getLogger(__name__)

HTTP_429_RETRY_COUNT = 3
HTTP_429_RETRY_DELAY_SECONDS = 5


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


async def _match_exists(session: AsyncSession, game_id: int) -> bool:
    existing_match_id = await session.scalar(
        select(Match.gameId).where(Match.gameId == game_id)
    )
    return existing_match_id is not None


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
            participant_items = ((None, participant_frame) for participant_frame in participant_frames_raw)

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


async def ingest_match(match_id: str, region: str) -> bool:
    """Ingest a single Riot match and its timeline into local storage.

    Returns True when a new match is inserted, and False when skipped because
    the match already exists.
    """
    game_id = _extract_game_id(match_id)
    normalized_region = region.strip().lower()
    if not normalized_region:
        raise ValueError("region cannot be empty.")

    # Step 1: pre-check idempotency before making Riot API calls.
    async with AsyncSessionFactory() as session:
        if await _match_exists(session, game_id):
            logger.warning(
                "Skipping match; already exists before fetch (match_id=%s, game_id=%s, region=%s)",
                match_id,
                game_id,
                normalized_region,
            )
            return False

    # Step 2: fetch Riot payloads.
    try:
        async with RiotClient(
            settings.riot_api_key.get_secret_value(),
            redis_url=settings.redis_url,
        ) as riot_client:
            match_payload = await riot_client.get_match(match_id, normalized_region)
            timeline_payload = await riot_client.get_timeline(match_id, normalized_region)
    except Exception:
        logger.error(
            "Failed to fetch match payloads (match_id=%s, region=%s)",
            match_id,
            normalized_region,
            exc_info=True,
        )
        raise

    # Step 3: validate payloads with DTOs.
    match_dto = MatchDTO.model_validate(match_payload)
    validated_timeline = _validate_timeline_payload(timeline_payload)

    if match_dto.info.gameId != game_id:
        raise ValueError(
            f"Match ID mismatch: requested {game_id}, received {match_dto.info.gameId}."
        )

    # Steps 4 and 5: write to DB via upsert ops and commit.
    async with AsyncSessionFactory() as session:
        if await _match_exists(session, game_id):
            logger.warning(
                "Skipping match; already exists on recheck (match_id=%s, game_id=%s, region=%s)",
                match_id,
                game_id,
                normalized_region,
            )
            return False

        inserted = await upsert_match(session, match_dto)
        if not inserted:
            await session.rollback()
            logger.warning(
                "Skipping match; upsert returned not inserted (match_id=%s, game_id=%s, region=%s)",
                match_id,
                game_id,
                normalized_region,
            )
            return False

        await upsert_participants(session, game_id, match_dto.participants)
        await upsert_timeline_frames(session, game_id, validated_timeline)
        await session.commit()

    logger.info(
        "Stored match (match_id=%s, game_id=%s, region=%s, participants=%s)",
        match_id,
        game_id,
        normalized_region,
        len(match_dto.participants),
    )

    return True


async def ingest_summoner(
    game_name: str,
    tag_line: str,
    region: str,
    count: int = 20,
    queue: int = 420,
    progress_callback: Callable[[int, int, str], None] | None = None,
) -> dict[str, Any]:
    """Ingest a summoner and sequentially ingest their recent matches.

    The function fetches a summoner by Riot ID, upserts the summoner row,
    fetches up to `count` recent match IDs, and calls ingest_match() for each
    match sequentially.
    """
    normalized_game_name = game_name.strip()
    normalized_tag_line = tag_line.strip()
    normalized_region = region.strip().lower()

    if not normalized_game_name:
        raise ValueError("game_name cannot be empty.")
    if not normalized_tag_line:
        raise ValueError("tag_line cannot be empty.")
    if not normalized_region:
        raise ValueError("region cannot be empty.")
    if count < 1 or count > 100:
        raise ValueError("count must be between 1 and 100.")
    if queue < 0:
        raise ValueError("queue must be >= 0.")

    # Riot summoner lookup is platform-routed; match-v5 is regional-routed.
    if normalized_region in {"americas", "asia", "europe", "sea"}:
        platform_region = settings.riot_platform.strip().lower()
    else:
        platform_region = normalized_region

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
            match_ids = await riot_client.get_match_ids(
                puuid=summoner_dto.puuid,
                region=normalized_region,
                count=count,
                queue=queue,
            )
    except Exception:
        logger.error(
            "Failed to fetch summoner or match list (game_name=%s, tag_line=%s, region=%s)",
            normalized_game_name,
            normalized_tag_line,
            normalized_region,
            exc_info=True,
        )
        raise

    async with AsyncSessionFactory() as session:
        await upsert_summoner(session, summoner_dto)
        await session.commit()

    logger.info(
        "Upserted summoner and fetched match list "
        "(puuid=%s, requested_count=%s, fetched_count=%s, queue=%s)",
        summoner_dto.puuid,
        count,
        len(match_ids),
        queue,
    )

    inserted_matches = 0
    skipped_matches = 0
    failed_matches = 0
    ingestion_results: list[dict[str, Any]] = []
    total_matches = len(match_ids)

    for index, recent_match_id in enumerate(match_ids, start=1):
        if progress_callback is not None:
            try:
                progress_callback(index, total_matches, recent_match_id)
            except Exception:
                logger.warning(
                    "Progress callback failed; continuing ingestion "
                    "(match_id=%s, index=%s, total=%s)",
                    recent_match_id,
                    index,
                    total_matches,
                    exc_info=True,
                )

        attempt = 0
        while True:
            try:
                inserted = await ingest_match(recent_match_id, normalized_region)
                if inserted:
                    inserted_matches += 1
                else:
                    skipped_matches += 1

                ingestion_results.append(
                    {
                        "match_id": recent_match_id,
                        "inserted": inserted,
                    }
                )
                break
            except httpx.HTTPStatusError as exc:
                status_code = exc.response.status_code if exc.response is not None else None
                if status_code == 429 and attempt < HTTP_429_RETRY_COUNT:
                    attempt += 1
                    logger.warning(
                        "Rate limited during match ingestion; retrying after delay "
                        "(match_id=%s, region=%s, attempt=%s/%s, delay_seconds=%s)",
                        recent_match_id,
                        normalized_region,
                        attempt,
                        HTTP_429_RETRY_COUNT,
                        HTTP_429_RETRY_DELAY_SECONDS,
                    )
                    await asyncio.sleep(HTTP_429_RETRY_DELAY_SECONDS)
                    continue

                failed_matches += 1
                logger.error(
                    "Match ingestion failed with HTTP error; continuing to next match "
                    "(match_id=%s, region=%s, status_code=%s)",
                    recent_match_id,
                    normalized_region,
                    status_code,
                    exc_info=True,
                )
                ingestion_results.append(
                    {
                        "match_id": recent_match_id,
                        "inserted": False,
                        "error": f"HTTP {status_code}",
                    }
                )
                break
            except Exception:
                failed_matches += 1
                logger.error(
                    "Match ingestion failed with unexpected error; continuing to next match "
                    "(match_id=%s, region=%s)",
                    recent_match_id,
                    normalized_region,
                    exc_info=True,
                )
                ingestion_results.append(
                    {
                        "match_id": recent_match_id,
                        "inserted": False,
                        "error": "unexpected_error",
                    }
                )
                break

    logger.info(
        "Summoner ingestion run completed (puuid=%s, requested_count=%s, fetched_count=%s, "
        "queue=%s, inserted=%s, skipped=%s, failed=%s)",
        summoner_dto.puuid,
        count,
        len(match_ids),
        queue,
        inserted_matches,
        skipped_matches,
        failed_matches,
    )

    return {
        "puuid": summoner_dto.puuid,
        "requested_count": count,
        "queue": queue,
        "fetched_match_count": len(match_ids),
        "inserted_matches": inserted_matches,
        "skipped_matches": skipped_matches,
        "failed_matches": failed_matches,
        "results": ingestion_results,
    }

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from models.db import Match, MatchParticipant, MatchTimelineFrame, Summoner
from models.riot_dtos import MatchDTO, ParticipantDTO, SummonerDTO

import time

import logging
logger = logging.getLogger(__name__)


def upsert_summoner_sync(session: Session, dto: SummonerDTO, region: str) -> None:
    """Insert or update a summoner row keyed by puuid."""
    payload = {
        "puuid": dto.puuid,
        "id": dto.id,
        "profileIconId": dto.profileIconId,
        "summonerLevel": dto.summonerLevel,
        "region": region,
    }

    stmt = insert(Summoner).values(**payload)
    upsert_stmt = stmt.on_conflict_do_update(
        index_elements=[Summoner.puuid],
        set_={
            "id": stmt.excluded.id,
            "profileIconId": stmt.excluded.profileIconId,
            "summonerLevel": stmt.excluded.summonerLevel,
            "region": stmt.excluded.region,
        },
    )

    session.execute(upsert_stmt)


def upsert_match_sync(session: Session, dto: MatchDTO) -> bool:
    """Insert a match row if absent; return True when inserted, False when skipped."""
    existing_match_id = session.scalar(
        select(Match.gameId).where(Match.gameId == dto.info.gameId)
    )
    if existing_match_id is not None:
        return False

    winning_teams = {participant.teamId for participant in dto.participants if participant.win}
    if not winning_teams:
        raise ValueError("Could not determine winning_team from participants.")
    if len(winning_teams) > 1:
        raise ValueError("Found multiple winning teams in participants payload.")

    winning_team = winning_teams.pop()
    if winning_team not in {100, 200}:
        raise ValueError(f"Unexpected winning_team value: {winning_team}")

    payload = {
        "gameId": dto.info.gameId,
        "gameDuration": dto.info.gameDuration,
        "gameStartTimestamp": dto.info.gameStartTimestamp,
        "queueId": dto.info.queueId,
        "gameVersion": dto.info.gameVersion,
    }

    stmt = insert(Match).values(**payload).on_conflict_do_nothing(
        index_elements=[Match.gameId]
    )
    result = session.execute(stmt)
    return bool(result.rowcount and result.rowcount > 0)


def upsert_participants_sync(
    session: Session,
    match_id: int,
    participants: list[ParticipantDTO],
) -> None:
    """Upsert participants for a match by replacing the existing participant set."""
    game_duration_seconds = session.scalar(
        select(Match.gameDuration).where(Match.gameId == match_id)
    )
    if game_duration_seconds is None:
        raise ValueError(f"Match {match_id} was not found; cannot upsert participants.")

    game_duration_minutes = game_duration_seconds / 60

    team_total_damage: dict[int, int] = defaultdict(int)
    team_total_kills: dict[int, int] = defaultdict(int)
    for participant in participants:
        team_total_damage[participant.teamId] += participant.totalDamageDealtToChampions
        team_total_kills[participant.teamId] += participant.kills

    rows: list[dict[str, object]] = []
    for participant in participants:
        total_cs = participant.minionsKilled + participant.neutralMinionsKilled
        cs_per_min = total_cs / game_duration_minutes if game_duration_minutes > 0 else 0.0

        team_damage = team_total_damage.get(participant.teamId, 0)
        damage_share = (
            participant.totalDamageDealtToChampions / team_damage if team_damage > 0 else 0.0
        )

        team_kills = team_total_kills.get(participant.teamId, 0)
        kill_participation = (
            (participant.kills + participant.assists) / team_kills if team_kills > 0 else 0.0
        )

        challenges_payload = dict(participant.challenges)
        challenges_payload.update(
            {
                "cs_per_min": cs_per_min,
                "damage_share": damage_share,
                "kill_participation": kill_participation,
            }
        )

        rows.append(
            {
                "gameId": match_id,
                "puuid": participant.puuid,
                "kills": participant.kills,
                "deaths": participant.deaths,
                "assists": participant.assists,
                "totalDamageDealtToChampions": participant.totalDamageDealtToChampions,
                "goldEarned": participant.goldEarned,
                "visionScore": participant.visionScore,
                "championId": participant.championId,
                "teamId": participant.teamId,
                "individualPosition": participant.individualPosition,
                "teamPosition": participant.teamPosition or participant.individualPosition,
                "win": participant.win,
                "summoner1Id": participant.summoner1Id,
                "summoner2Id": participant.summoner2Id,
                "challenges": challenges_payload,
                "perks": participant.perks,
            }
        )

    session.execute(delete(MatchParticipant).where(MatchParticipant.gameId == match_id))
    if rows:
        t0 = time.perf_counter()
        session.execute(insert(MatchParticipant), rows)
        logger.debug(
            "participants bulk insert: %.0fms (match_id=%s, rows=%s)",
            (time.perf_counter() - t0) * 1000,
            match_id,
            len(rows),
        )


def _value(source: object, key: str, default: Any = None) -> Any:
    """Read value from either dict-style or attribute-style objects."""
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def _extract_frames(timeline_dto: object) -> list[object]:
    """Accept timeline payloads shaped as {info: {frames}}, {frames}, or raw frame lists."""
    if isinstance(timeline_dto, list):
        return timeline_dto

    frames = _value(timeline_dto, "frames")
    if frames is None:
        info = _value(timeline_dto, "info")
        if info is not None:
            frames = _value(info, "frames")

    if frames is None:
        raise ValueError("timeline_dto does not contain a frames collection.")

    return list(frames)


def upsert_timeline_frames_sync(session: Session, match_id: int, timeline_dto: object) -> None:
    """Upsert match timeline frames by replacing existing rows for a given match."""
    frames = _extract_frames(timeline_dto)
    rows: list[dict[str, object]] = []

    for frame in frames:
        frame_timestamp = _value(frame, "timestamp")
        if frame_timestamp is None:
            raise ValueError("Timeline frame is missing timestamp.")

        frame_timestamp_ms = int(frame_timestamp)
        minute = frame_timestamp_ms // 60000
        frame_timestamp_dt = datetime.fromtimestamp(frame_timestamp_ms / 1000, tz=timezone.utc)
        participant_frames = _value(frame, "participantFrames", [])

        if isinstance(participant_frames, dict):
            participant_iterable = participant_frames.items()
        else:
            participant_iterable = ((None, participant_frame) for participant_frame in participant_frames)

        for participant_key, participant_frame in participant_iterable:
            participant_id = _value(participant_frame, "participantId")
            if participant_id is None and participant_key is not None:
                participant_id = int(participant_key)

            if participant_id is None:
                raise ValueError("Participant frame is missing participantId.")

            position = _value(participant_frame, "position", {}) or {}

            rows.append(
                {
                    "match_id": match_id,
                    "participant_id": int(participant_id),
                    "minute": minute,
                    "frame_timestamp": frame_timestamp_dt,
                    "current_gold": int(_value(participant_frame, "currentGold", 0)),
                    "total_gold": int(_value(participant_frame, "totalGold", 0)),
                    "xp": int(_value(participant_frame, "xp", 0)),
                    "level": int(_value(participant_frame, "level", 0)),
                    "minions_killed": int(_value(participant_frame, "minionsKilled", 0)),
                    "jungle_minions_killed": int(
                        _value(participant_frame, "jungleMinionsKilled", 0)
                    ),
                    "position_x": int(_value(position, "x", 0)),
                    "position_y": int(_value(position, "y", 0)),
                }
            )

    session.execute(
            delete(MatchTimelineFrame).where(MatchTimelineFrame.match_id == match_id)
        )
    if rows:
            t0 = time.perf_counter()
            session.execute(insert(MatchTimelineFrame), rows)
            logger.debug(
                "timeline bulk insert: %.0fms (match_id=%s, rows=%s)",
                (time.perf_counter() - t0) * 1000,
                match_id,
                len(rows),
        )

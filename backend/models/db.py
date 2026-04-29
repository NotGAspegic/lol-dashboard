from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models used by Alembic autogeneration."""


class Summoner(Base):
    """Persisted summoner profile data used by the ingestion pipeline."""

    __tablename__ = "summoners"

    puuid: Mapped[str] = mapped_column(String(78), primary_key=True)
    id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    profileIconId: Mapped[int] = mapped_column(Integer, nullable=False)
    summonerLevel: Mapped[int] = mapped_column(Integer, nullable=False)
    game_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    tag_line: Mapped[str | None] = mapped_column(String(32), nullable=True)
    riot_id_slug: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    match_history_cursor: Mapped[str | None] = mapped_column(String(32), nullable=True)
    region: Mapped[str] = mapped_column(String(32), nullable=False)
    last_updated: Mapped[datetime] = mapped_column(
    DateTime(timezone=True),
    default=func.now(),
    onupdate=func.now(),
    )


class Match(Base):
    """Core persisted match metadata from Riot match info payloads."""

    __tablename__ = "matches"

    gameId: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    gameDuration: Mapped[int] = mapped_column(Integer, nullable=False)
    gameStartTimestamp: Mapped[int] = mapped_column(BigInteger, nullable=False)
    queueId: Mapped[int] = mapped_column(Integer, nullable=False)
    gameVersion: Mapped[str] = mapped_column(String(32), nullable=False)

    participants: Mapped[list[MatchParticipant]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
    )
    timeline_frames: Mapped[list[MatchTimelineFrame]] = relationship(
        back_populates="match",
        cascade="all, delete-orphan",
    )


class MatchParticipant(Base):
    """Participant-level stats for a given persisted match."""

    __tablename__ = "match_participants"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    gameId: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("matches.gameId", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    puuid: Mapped[str | None] = mapped_column(String(78), nullable=True, index=True)
    kills: Mapped[int] = mapped_column(Integer, nullable=False)
    deaths: Mapped[int] = mapped_column(Integer, nullable=False)
    assists: Mapped[int] = mapped_column(Integer, nullable=False)
    totalDamageDealtToChampions: Mapped[int] = mapped_column(Integer, nullable=False)
    goldEarned: Mapped[int] = mapped_column(Integer, nullable=False)
    visionScore: Mapped[int] = mapped_column(Integer, nullable=False)
    championId: Mapped[int] = mapped_column(Integer, nullable=False)
    teamId: Mapped[int] = mapped_column(Integer, nullable=False)
    individualPosition: Mapped[str] = mapped_column(String(32), nullable=False)
    teamPosition: Mapped[str | None] = mapped_column(String(32), nullable=True)
    win: Mapped[bool] = mapped_column(Boolean, nullable=False)
    summoner1Id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    summoner2Id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    challenges: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    perks: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

    match: Mapped[Match] = relationship(back_populates="participants")


class RankSnapshot(Base):
    """Daily snapshot of a summoner's ranked queue state for historical LP charts."""

    __tablename__ = "rank_snapshots"
    __table_args__ = (
        UniqueConstraint("puuid", "queue_type", "snapshot_date", name="uq_rank_snapshots_puuid_queue_date"),
        Index("ix_rank_snapshots_puuid_queue_captured_at", "puuid", "queue_type", "captured_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    puuid: Mapped[str] = mapped_column(
        String(78),
        ForeignKey("summoners.puuid", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    queue_type: Mapped[str] = mapped_column(String(32), nullable=False)
    tier: Mapped[str] = mapped_column(String(32), nullable=False)
    rank: Mapped[str | None] = mapped_column(String(8), nullable=True)
    league_points: Mapped[int] = mapped_column(Integer, nullable=False)
    wins: Mapped[int] = mapped_column(Integer, nullable=False)
    losses: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class MatchTimelineFrame(Base):
    """Minute-level participant timeline snapshots for TimescaleDB hypertables."""

    __tablename__ = "match_timeline_frames"
    __table_args__ = (
        # Explicitly define the read path index so Alembic doesn't infer only PK indexing.
        Index(
            "ix_match_timeline_frames_match_id_participant_id_minute",
            "match_id",
            "participant_id",
            "minute",
        ),
        {"info": {"timescaledb_hypertable": True}},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    match_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("matches.gameId", ondelete="CASCADE"),
        nullable=False,
    )
    participant_id: Mapped[int] = mapped_column(Integer, nullable=False)
    minute: Mapped[int] = mapped_column(Integer, nullable=False)
    frame_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False , primary_key=True)
    current_gold: Mapped[int] = mapped_column(Integer, nullable=False)
    total_gold: Mapped[int] = mapped_column(Integer, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, nullable=False)
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    minions_killed: Mapped[int] = mapped_column(Integer, nullable=False)
    jungle_minions_killed: Mapped[int] = mapped_column(Integer, nullable=False)
    position_x: Mapped[int] = mapped_column(Integer, nullable=False)
    position_y: Mapped[int] = mapped_column(Integer, nullable=False)
    match: Mapped[Match] = relationship(back_populates="timeline_frames")
    __mapper_args__ = {"primary_key": ["id", "frame_timestamp"]}



class FailedIngestion(Base):
    """Dead letter record for match ingestion tasks that exhausted all retries."""

    __tablename__ = "failed_ingestions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    match_id: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    region: Mapped[str] = mapped_column(String(32), nullable=False)
    error_type: Mapped[str] = mapped_column(String(128), nullable=False)
    error_message: Mapped[str] = mapped_column(String(1024), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    failed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

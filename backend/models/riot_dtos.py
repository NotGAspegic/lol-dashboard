from typing import Any

from pydantic import AliasChoices, AliasPath, BaseModel, ConfigDict, Field


class SummonerDTO(BaseModel):
    """Subset of Riot Summoner DTO used by this project."""

    model_config = ConfigDict(extra="ignore")

    puuid: str
    id: str | None = Field(
        default=None,
        description="Encrypted summoner ID (encryptedSummonerId). May be absent in some responses.",
    )
    profileIconId: int
    summonerLevel: int


class ParticipantDTO(BaseModel):
    """Blueprint subset of Riot Match Participant DTO used by this project."""

    model_config = ConfigDict(extra="ignore")

    puuid: str
    kills: int
    deaths: int
    assists: int
    totalDamageDealtToChampions: int
    goldEarned: int
    visionScore: int
    minionsKilled: int = Field(
        default=0,
        validation_alias=AliasChoices("minionsKilled", "totalMinionsKilled"),
    )
    neutralMinionsKilled: int = 0
    championId: int
    teamId: int
    individualPosition: str
    teamPosition: str | None = None
    win: bool
    summoner1Id: int | None = None
    summoner2Id: int | None = None
    challenges: dict[str, Any] = Field(default_factory=dict)
    perks: dict[str, Any] = Field(default_factory=dict)


class MatchInfoDTO(BaseModel):
    """Core match metadata used by the application blueprint."""

    model_config = ConfigDict(extra="ignore")

    gameId: int
    gameDuration: int
    gameStartTimestamp: int
    queueId: int
    gameVersion: str


class MatchDTO(BaseModel):
    """Match payload composed of core match info and participant stats."""

    model_config = ConfigDict(extra="ignore")

    info: MatchInfoDTO
    participants: list[ParticipantDTO] = Field(
        default_factory=list,
        validation_alias=AliasChoices("participants", AliasPath("info", "participants")),
    )


class PositionDTO(BaseModel):
    """2D map coordinate for a participant state in a timeline frame."""

    model_config = ConfigDict(extra="ignore")

    x: int
    y: int


class ParticipantFrameDTO(BaseModel):
    """Per-participant frame stats extracted from Riot timeline payloads."""

    model_config = ConfigDict(extra="ignore")

    participantId: int
    currentGold: int
    totalGold: int
    xp: int
    level: int
    minionsKilled: int
    jungleMinionsKilled: int
    position: PositionDTO


class TimelineFrameDTO(BaseModel):
    """Timeline frame payload composed of participant frame snapshots."""

    model_config = ConfigDict(extra="ignore")

    participantFrames: list[ParticipantFrameDTO] = Field(default_factory=list)

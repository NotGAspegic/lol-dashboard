from __future__ import annotations

from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from metrics import record_ml_prediction

try:
    from ...models.db import Match, MatchParticipant
    from ..features.draft_features import compute_draft_features, compute_player_champion_history
    from ..model_registry import load_model_registry
except ImportError:
    from models.db import Match, MatchParticipant
    from ml.features.draft_features import compute_draft_features, compute_player_champion_history
    from ml.model_registry import load_model_registry


UNKNOWN_POSITION = "UNKNOWN"


def _confidence_from_probability(probability: float) -> str:
    if probability < 0.45 or probability > 0.75:
        return "high"
    if 0.45 <= probability <= 0.55:
        return "low"
    return "moderate"


async def _fetch_history_frame(session: AsyncSession) -> pd.DataFrame:
    rows = await session.execute(
        select(
            Match.gameId,
            Match.gameStartTimestamp,
            Match.gameVersion,
            MatchParticipant.puuid,
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.championId,
            MatchParticipant.teamId,
            MatchParticipant.individualPosition,
            MatchParticipant.teamPosition,
            MatchParticipant.win,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
    )

    records = [
        {
            "gameId": row.gameId,
            "gameStartTimestamp": row.gameStartTimestamp,
            "gameVersion": row.gameVersion,
            "puuid": row.puuid,
            "kills": row.kills,
            "deaths": row.deaths,
            "assists": row.assists,
            "championId": row.championId,
            "teamId": row.teamId,
            "individualPosition": row.individualPosition,
            "teamPosition": row.teamPosition,
            "win": row.win,
        }
        for row in rows
    ]

    if not records:
        return pd.DataFrame(
            columns=[
                "gameId",
                "gameStartTimestamp",
                "gameVersion",
                "puuid",
                "kills",
                "deaths",
                "assists",
                "championId",
                "teamId",
                "individualPosition",
                "teamPosition",
                "win",
            ]
        )

    return pd.DataFrame.from_records(records)


async def _fetch_latest_patch_version(session: AsyncSession) -> str:
    game_version = await session.scalar(
        select(Match.gameVersion).order_by(Match.gameStartTimestamp.desc()).limit(1)
    )
    if game_version is None:
        raise ValueError("No matches are available to infer the current patch version")
    return str(game_version)


def _build_prediction_row(
    puuid: str,
    ally_champion_ids: list[int],
    enemy_champion_ids: list[int],
    player_champion_id: int,
    game_version: str,
) -> dict[str, Any]:
    player_index = ally_champion_ids.index(player_champion_id)
    ally_puuids = [""] * len(ally_champion_ids)
    ally_puuids[player_index] = puuid

    return {
        "player_puuid": puuid,
        "player_champion_id": player_champion_id,
        "ally_champion_ids": ally_champion_ids,
        "enemy_champion_ids": enemy_champion_ids,
        "ally_puuids": ally_puuids,
        "enemy_puuids": [""] * len(enemy_champion_ids),
        "ally_positions": [UNKNOWN_POSITION] * len(ally_champion_ids),
        "enemy_positions": [UNKNOWN_POSITION] * len(enemy_champion_ids),
        "gameVersion": game_version,
    }


async def predict_draft_win(
    puuid: str,
    ally_champion_ids: list[int],
    enemy_champion_ids: list[int],
    player_champion_id: int,
    session: AsyncSession,
) -> dict[str, Any]:
    history_df = await _fetch_history_frame(session)
    if history_df.empty:
        raise ValueError("No match history is available for draft prediction")

    if player_champion_id not in ally_champion_ids:
        raise ValueError("player_champion_id must be included in ally_champion_ids")

    game_version = await _fetch_latest_patch_version(session)
    prediction_row = _build_prediction_row(
        puuid=puuid,
        ally_champion_ids=ally_champion_ids,
        enemy_champion_ids=enemy_champion_ids,
        player_champion_id=player_champion_id,
        game_version=game_version,
    )

    feature_row = compute_draft_features(prediction_row, history_df=history_df)
    player_history = compute_player_champion_history(prediction_row, history_df=history_df)

    registry = load_model_registry()["draft_v1"]
    model = registry["model"]
    feature_names = registry["feature_names"]
    training_matches = int(registry.get("training_matches", 0))

    feature_values = [float(feature_row.get(name, 0.0)) for name in feature_names]
    feature_frame = pd.DataFrame([feature_values], columns=feature_names)

    win_probability = float(model.predict_proba(feature_frame)[0][1])
    player_champion_games = int(player_history["player_games_on_champ"])
    player_champion_winrate = round(float(player_history["player_winrate_on_champ"]) * 100, 1)
    record_ml_prediction("draft_v1")

    return {
        "win_probability": round(win_probability, 4),
        "confidence": _confidence_from_probability(win_probability),
        "player_champion_games": player_champion_games,
        "player_champion_winrate": player_champion_winrate,
        "note": f"Based on {training_matches} training matches",
    }

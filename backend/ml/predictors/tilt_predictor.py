from __future__ import annotations

from typing import Any

import pandas as pd
import shap
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from ..features.shap_reasons import top_reasons
    from ..features.tilt_features import compute_tilt_features
    from ..model_registry import load_model_registry
    from ..models.db import Match, MatchParticipant
except ImportError:
    from ml.features.shap_reasons import top_reasons
    from ml.features.tilt_features import compute_tilt_features
    from ml.model_registry import load_model_registry
    from models.db import Match, MatchParticipant


LOOKBACK_GAMES = 15
ANALYSIS_WINDOW = 10


def _tilt_level_from_score(score: float) -> str:
    if score >= 0.7:
        return "high"
    if score >= 0.4:
        return "moderate"
    return "low"


def _feature_row_from_games(games_df: pd.DataFrame) -> pd.Series:
    features_df = compute_tilt_features(games_df, window=ANALYSIS_WINDOW)
    if features_df.empty:
        raise ValueError("Unable to compute tilt features from the available games")
    return features_df.iloc[0]


async def _fetch_recent_games(session: AsyncSession, puuid: str, limit: int) -> pd.DataFrame:
    rows = await session.execute(
        select(
            Match.gameStartTimestamp,
            MatchParticipant.gameId,
            MatchParticipant.kills,
            MatchParticipant.deaths,
            MatchParticipant.assists,
            MatchParticipant.win,
            MatchParticipant.championId,
        )
        .join(Match, Match.gameId == MatchParticipant.gameId)
        .where(MatchParticipant.puuid == puuid)
        .order_by(Match.gameStartTimestamp.desc())
        .limit(limit)
    )

    records = [
        {
            "gameStartTimestamp": row.gameStartTimestamp,
            "gameId": row.gameId,
            "kills": row.kills,
            "deaths": row.deaths,
            "assists": row.assists,
            "win": row.win,
            "championId": row.championId,
        }
        for row in rows
    ]

    if not records:
        return pd.DataFrame(
            columns=[
                "gameStartTimestamp",
                "gameId",
                "kills",
                "deaths",
                "assists",
                "win",
                "championId",
            ]
        )

    return pd.DataFrame.from_records(records)


async def predict_tilt(puuid: str, session: AsyncSession) -> dict[str, Any]:
    games_df = await _fetch_recent_games(session, puuid, limit=LOOKBACK_GAMES)

    if len(games_df) < ANALYSIS_WINDOW:
        return {
            "tilt_score": None,
            "tilt_level": "insufficient_data",
            "reasons": ["Need at least 10 ranked games to analyze tilt patterns"],
            "games_analyzed": len(games_df),
        }

    feature_row = _feature_row_from_games(games_df)
    registry = load_model_registry()["tilt_v1"]
    pipeline = registry["model"]
    feature_names = registry["feature_names"]

    feature_values = [float(feature_row[name]) for name in feature_names]
    feature_frame = pd.DataFrame([feature_values], columns=feature_names)

    tilt_score = float(pipeline.predict_proba(feature_frame)[0][1])
    scaled_x = pipeline.named_steps["scaler"].transform(feature_frame)
    explainer = shap.TreeExplainer(pipeline.named_steps["clf"])
    shap_values = explainer.shap_values(scaled_x)

    if isinstance(shap_values, (list, tuple)):
        positive_class_shap = shap_values[-1]
    else:
        positive_class_shap = shap_values

    reasons = top_reasons(positive_class_shap, feature_names, feature_values, n=3)

    return {
        "tilt_score": tilt_score,
        "tilt_level": _tilt_level_from_score(tilt_score),
        "reasons": reasons,
        "games_analyzed": ANALYSIS_WINDOW,
    }

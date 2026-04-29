from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.stats import linregress


def slope(series: np.ndarray | pd.Series | list[float]) -> float:
    """Linear regression slope - positive means improving, negative means declining."""
    values = np.asarray(series, dtype=float)
    if len(values) < 2:
        return 0.0

    x = np.arange(len(values), dtype=float)
    slope_value, *_ = linregress(x, values)
    return float(slope_value)


def consecutive_losses(win_series: list[bool] | pd.Series) -> int:
    """Count losses from the start of the series until the first win."""
    count = 0
    for won in win_series:
        if not bool(won):
            count += 1
        else:
            break
    return count


def _history_baseline_kda(ordered_games: pd.DataFrame, start_index: int, window: int) -> float:
    """Return the leak-free KDA baseline available at this snapshot in time.

    With newest-first ordering, rows after ``start_index + window`` are strictly
    older than the current analysis window. Those games are the only baseline we
    should use when labeling historical snapshots.
    """

    historical_games = ordered_games.iloc[start_index + window :].copy()
    if historical_games.empty:
        historical_games = ordered_games.iloc[start_index : start_index + window].copy()

    historical_kda = (
        (historical_games["kills"] + historical_games["assists"])
        / historical_games["deaths"].clip(lower=1)
    )
    return float(historical_kda.mean())


@dataclass(frozen=True)
class TiltFeatureWindow:
    snapshot_index: int
    game_start_timestamp: int
    consecutive_losses: int
    kda_slope: float
    death_trend: float
    inter_game_minutes_mean: float
    inter_game_minutes_min: float
    champ_variety: int
    win_rate_window: float
    avg_kda_window: float
    career_kda: float
    tilt: int


def compute_tilt_features(games_df: pd.DataFrame, window: int = 10) -> pd.DataFrame:
    """Compute rolling tilt-detection snapshots from a player's recent games.

    The input should already represent one player's matches and is expected to be
    sorted newest-first. The function re-sorts defensively to preserve that order.
    One output row is produced per valid window.
    """

    if games_df.empty:
        return pd.DataFrame(
            columns=[
                "snapshot_index",
                "game_start_timestamp",
                "consecutive_losses",
                "kda_slope",
                "death_trend",
                "inter_game_minutes_mean",
                "inter_game_minutes_min",
                "champ_variety",
                "win_rate_window",
                "avg_kda_window",
                "career_kda",
                "tilt",
            ]
        )

    required_columns = {"gameStartTimestamp", "kills", "deaths", "assists", "win", "championId"}
    missing_columns = required_columns.difference(games_df.columns)
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"games_df is missing required columns: {missing}")

    ordered = games_df.sort_values("gameStartTimestamp", ascending=False).reset_index(drop=True).copy()
    ordered["kda"] = (ordered["kills"] + ordered["assists"]) / ordered["deaths"].clip(lower=1)

    rows: list[dict[str, float | int]] = []

    if len(ordered) < window:
        return pd.DataFrame(rows)

    for i in range(len(ordered) - window + 1):
        snapshot = ordered.iloc[i : i + window]
        timestamps = snapshot["gameStartTimestamp"].astype(float)
        gaps = timestamps.diff().abs().dropna() / 60000.0

        window_kda = snapshot["kda"].to_numpy(dtype=float)
        window_win_rate = float(snapshot["win"].mean())
        avg_kda_window = float(window_kda.mean())
        career_kda = _history_baseline_kda(ordered, i, window)
        consecutive = consecutive_losses(snapshot["win"].tolist())
        tilt_label = int(consecutive >= 3 and avg_kda_window <= career_kda * 0.8)

        rows.append(
            {
                "snapshot_index": i,
                "game_start_timestamp": int(snapshot.iloc[0]["gameStartTimestamp"]),
                "consecutive_losses": consecutive,
                "kda_slope": slope(window_kda),
                "death_trend": slope(snapshot["deaths"].to_numpy(dtype=float)),
                "inter_game_minutes_mean": float(gaps.mean()) if not gaps.empty else 0.0,
                "inter_game_minutes_min": float(gaps.min()) if not gaps.empty else 0.0,
                "champ_variety": int(snapshot["championId"].nunique()),
                "win_rate_window": window_win_rate,
                "avg_kda_window": avg_kda_window,
                "career_kda": career_kda,
                "tilt": tilt_label,
            }
        )

    return pd.DataFrame(rows)

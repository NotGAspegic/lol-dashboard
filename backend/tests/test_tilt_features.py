from __future__ import annotations

import pandas as pd

from ml.features.tilt_features import compute_tilt_features


def test_compute_tilt_features_produces_expected_shape() -> None:
    games_df = pd.DataFrame(
        [
            {
                "gameStartTimestamp": 1_700_000_000_000 - (index * 3_600_000),
                "kills": 12 - index,
                "deaths": 1 + (index % 4),
                "assists": 8 - (index % 3),
                "win": index % 4 != 0,
                "championId": 100 + (index % 5),
            }
            for index in range(12)
        ]
    )

    features = compute_tilt_features(games_df, window=10)

    assert list(features.columns) == [
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
    assert features.shape == (3, 12)
    assert features["snapshot_index"].tolist() == [0, 1, 2]
    assert features["game_start_timestamp"].tolist() == games_df["gameStartTimestamp"].head(3).tolist()

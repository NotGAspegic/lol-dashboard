from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd


TAG_ORDER = ("Fighter", "Mage", "Support", "Marksman", "Tank", "Assassin")
ROLE_ORDER = ("TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY")

BASE_DIR = Path(__file__).resolve().parents[1]
CHAMPION_TAGS_PATH = BASE_DIR / "data" / "champion_tags.json"


def _get_row_value(game_row: Mapping[str, Any] | pd.Series, key: str, default: Any = None) -> Any:
    if isinstance(game_row, pd.Series):
        return game_row.get(key, default)
    return game_row.get(key, default)


def _coerce_champion_ids(value: Any, field_name: str) -> list[int]:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            value = json.loads(stripped)
        elif stripped:
            value = [segment.strip() for segment in stripped.split(",")]
        else:
            value = []

    if not isinstance(value, Sequence) or isinstance(value, (bytes, bytearray)):
        raise ValueError(f"{field_name} must be a sequence of champion ids")

    champion_ids = [int(champion_id) for champion_id in value]
    if len(champion_ids) != 5:
        raise ValueError(f"{field_name} must contain exactly 5 champion ids")
    return champion_ids


def _coerce_strings(value: Any, field_name: str) -> list[str]:
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("["):
            value = json.loads(stripped)
        elif stripped:
            value = [segment.strip() for segment in stripped.split(",")]
        else:
            value = []

    if not isinstance(value, Sequence) or isinstance(value, (bytes, bytearray)):
        raise ValueError(f"{field_name} must be a sequence of strings")

    values = [str(item) for item in value]
    if len(values) != 5:
        raise ValueError(f"{field_name} must contain exactly 5 values")
    return values


def parse_patch_version(game_version: str) -> float:
    """Convert a Riot patch string like 16.8.764.3737 to 16.8."""
    parts = game_version.split(".")
    if len(parts) < 2:
        raise ValueError(f"Unrecognized gameVersion format: {game_version}")

    major = int(parts[0])
    minor = int(parts[1])
    return float(f"{major}.{minor}")


def _position_series(frame: pd.DataFrame) -> pd.Series:
    if "teamPosition" in frame.columns:
        position_series = frame["teamPosition"].fillna("").astype(str).str.strip()
        if "individualPosition" in frame.columns:
            fallback_series = frame["individualPosition"].fillna("UNKNOWN").astype(str)
            return position_series.where(position_series != "", fallback_series)
        return position_series.replace("", "UNKNOWN")

    if "individualPosition" in frame.columns:
        return frame["individualPosition"].fillna("UNKNOWN").astype(str)

    raise ValueError("frame is missing both teamPosition and individualPosition")


def _with_draft_position(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    result["_draft_position"] = _position_series(result)
    return result


def _ordered_team_rows(frame: pd.DataFrame, team_id: int) -> pd.DataFrame:
    role_rank = {role: index for index, role in enumerate(ROLE_ORDER)}
    ordered = _with_draft_position(frame.loc[frame["teamId"] == team_id].copy())
    ordered["_role_rank"] = ordered["_draft_position"].map(role_rank).fillna(len(role_rank))
    ordered = ordered.sort_values(["_role_rank", "championId", "puuid"]).drop(columns="_role_rank")
    return ordered.reset_index(drop=True)


@lru_cache(maxsize=1)
def load_champion_tags(path: Path = CHAMPION_TAGS_PATH) -> dict[int, tuple[str, ...]]:
    payload = json.loads(path.read_text())
    champions = payload.get("champions", payload)
    return {
        int(champion_id): tuple(tags)
        for champion_id, tags in champions.items()
    }


def compute_team_tag_counts(
    champion_ids: Sequence[int],
    champion_tags: Mapping[int, Sequence[str]],
    prefix: str,
) -> dict[str, int]:
    counts = {f"{prefix}_{tag.lower()}_count": 0 for tag in TAG_ORDER}

    for champion_id in champion_ids:
        for tag in champion_tags.get(int(champion_id), ()):
            if tag not in TAG_ORDER:
                continue
            counts[f"{prefix}_{tag.lower()}_count"] += 1

    return counts


def compute_tag_differentials(
    ally_counts: Mapping[str, int],
    enemy_counts: Mapping[str, int],
) -> dict[str, int]:
    differentials: dict[str, int] = {}
    for tag in TAG_ORDER:
        ally_key = f"ally_{tag.lower()}_count"
        enemy_key = f"enemy_{tag.lower()}_count"
        differentials[f"{tag.lower()}_count_diff"] = int(ally_counts[ally_key] - enemy_counts[enemy_key])
    return differentials


def _filter_prior_history(
    history_df: pd.DataFrame,
    puuid: str | None,
    champion_id: int,
    game_start_timestamp: int | None,
) -> pd.DataFrame:
    if history_df.empty:
        return history_df.iloc[0:0].copy()

    filtered = history_df.copy()
    if puuid is not None and "puuid" in filtered.columns:
        filtered = filtered.loc[filtered["puuid"] == puuid]

    filtered = filtered.loc[filtered["championId"] == champion_id]

    if game_start_timestamp is not None and "gameStartTimestamp" in filtered.columns:
        filtered = filtered.loc[filtered["gameStartTimestamp"] < game_start_timestamp]

    return filtered


def compute_player_champion_history(
    game_row: Mapping[str, Any] | pd.Series,
    history_df: pd.DataFrame,
) -> dict[str, float]:
    puuid = _get_row_value(game_row, "player_puuid", _get_row_value(game_row, "puuid"))
    champion_id = int(
        _get_row_value(game_row, "player_champion_id", _get_row_value(game_row, "championId"))
    )
    game_start_timestamp_raw = _get_row_value(game_row, "gameStartTimestamp")
    game_start_timestamp = (
        int(game_start_timestamp_raw)
        if game_start_timestamp_raw is not None and not pd.isna(game_start_timestamp_raw)
        else None
    )
    recent_window = 20

    player_history = history_df.copy()
    if puuid is not None and "puuid" in player_history.columns:
        player_history = player_history.loc[player_history["puuid"] == puuid]
    if game_start_timestamp is not None and "gameStartTimestamp" in player_history.columns:
        player_history = player_history.loc[player_history["gameStartTimestamp"] < game_start_timestamp]
    player_history = player_history.sort_values("gameStartTimestamp", ascending=False)

    prior_games = _filter_prior_history(
        history_df=player_history,
        puuid=puuid,
        champion_id=champion_id,
        game_start_timestamp=None,
    )

    recent_history = player_history.head(recent_window)

    if player_history.empty:
        player_games_total = 0.0
        player_overall_winrate = 0.0
        player_overall_kda = 0.0
        player_recent_winrate = 0.0
        player_recent_kda = 0.0
    else:
        overall_kda_values = (
            (player_history["kills"].astype(float) + player_history["assists"].astype(float))
            / player_history["deaths"].clip(lower=1).astype(float)
        )
        recent_kda_values = (
            (recent_history["kills"].astype(float) + recent_history["assists"].astype(float))
            / recent_history["deaths"].clip(lower=1).astype(float)
        )
        player_games_total = float(len(player_history))
        player_overall_winrate = float(player_history["win"].astype(float).mean())
        player_overall_kda = float(overall_kda_values.mean())
        player_recent_winrate = float(recent_history["win"].astype(float).mean())
        player_recent_kda = float(recent_kda_values.mean())

    if prior_games.empty:
        player_games_on_champ = 0.0
        player_winrate_on_champ = 0.0
        player_kda_on_champ = 0.0
    else:
        kda_values = (
            (prior_games["kills"].astype(float) + prior_games["assists"].astype(float))
            / prior_games["deaths"].clip(lower=1).astype(float)
        )
        player_games_on_champ = float(len(prior_games))
        player_winrate_on_champ = float(prior_games["win"].astype(float).mean())
        player_kda_on_champ = float(kda_values.mean())

    player_champion_share = 0.0 if player_games_total == 0 else float(player_games_on_champ / player_games_total)

    return {
        "player_games_total": player_games_total,
        "player_overall_winrate": player_overall_winrate,
        "player_overall_kda": player_overall_kda,
        "player_recent_winrate": player_recent_winrate,
        "player_recent_kda": player_recent_kda,
        "player_games_on_champ": player_games_on_champ,
        "player_winrate_on_champ": player_winrate_on_champ,
        "player_kda_on_champ": player_kda_on_champ,
        "player_champion_share": player_champion_share,
    }


def _compute_single_player_history(
    puuid: str | None,
    champion_id: int,
    game_start_timestamp: int | None,
    history_df: pd.DataFrame,
) -> dict[str, float]:
    row = {
        "player_puuid": puuid,
        "player_champion_id": champion_id,
        "gameStartTimestamp": game_start_timestamp,
    }
    return compute_player_champion_history(row, history_df)


def _prior_history_frame(
    game_row: Mapping[str, Any] | pd.Series,
    history_df: pd.DataFrame,
) -> pd.DataFrame:
    prior_history = history_df.copy()
    game_start_timestamp_raw = _get_row_value(game_row, "gameStartTimestamp")
    if game_start_timestamp_raw is not None and not pd.isna(game_start_timestamp_raw):
        prior_history = prior_history.loc[prior_history["gameStartTimestamp"] < int(game_start_timestamp_raw)]
    return prior_history


def compute_team_player_history_features(
    game_row: Mapping[str, Any] | pd.Series,
    history_df: pd.DataFrame,
) -> dict[str, float]:
    ally_puuids = _coerce_strings(_get_row_value(game_row, "ally_puuids"), "ally_puuids")
    enemy_puuids = _coerce_strings(_get_row_value(game_row, "enemy_puuids"), "enemy_puuids")
    ally_champion_ids = _coerce_champion_ids(_get_row_value(game_row, "ally_champion_ids"), "ally_champion_ids")
    enemy_champion_ids = _coerce_champion_ids(_get_row_value(game_row, "enemy_champion_ids"), "enemy_champion_ids")
    game_start_timestamp_raw = _get_row_value(game_row, "gameStartTimestamp")
    game_start_timestamp = (
        int(game_start_timestamp_raw)
        if game_start_timestamp_raw is not None and not pd.isna(game_start_timestamp_raw)
        else None
    )

    ally_rows = [
        _compute_single_player_history(puuid, champion_id, game_start_timestamp, history_df)
        for puuid, champion_id in zip(ally_puuids, ally_champion_ids)
    ]
    enemy_rows = [
        _compute_single_player_history(puuid, champion_id, game_start_timestamp, history_df)
        for puuid, champion_id in zip(enemy_puuids, enemy_champion_ids)
    ]

    def summarize(prefix: str, rows: list[dict[str, float]]) -> dict[str, float]:
        metrics = [
            "player_games_total",
            "player_overall_winrate",
            "player_overall_kda",
            "player_recent_winrate",
            "player_recent_kda",
            "player_games_on_champ",
            "player_winrate_on_champ",
            "player_kda_on_champ",
            "player_champion_share",
        ]
        summary: dict[str, float] = {}
        for metric in metrics:
            values = [float(row[metric]) for row in rows]
            summary[f"{prefix}_{metric}_avg"] = float(sum(values) / len(values))
            summary[f"{prefix}_{metric}_max"] = float(max(values))
        return summary

    ally_summary = summarize("ally_team", ally_rows)
    enemy_summary = summarize("enemy_team", enemy_rows)

    diff_summary: dict[str, float] = {}
    for key, value in ally_summary.items():
        if not key.endswith("_avg"):
            continue
        metric = key.removeprefix("ally_team_").removesuffix("_avg")
        enemy_key = f"enemy_team_{metric}_avg"
        diff_summary[f"team_{metric}_avg_diff"] = float(value - enemy_summary[enemy_key])

    return ally_summary | enemy_summary | diff_summary


def compute_champion_prior_features(
    game_row: Mapping[str, Any] | pd.Series,
    history_df: pd.DataFrame,
) -> dict[str, float]:
    ally_champion_ids = _coerce_champion_ids(
        _get_row_value(game_row, "ally_champion_ids"),
        field_name="ally_champion_ids",
    )
    enemy_champion_ids = _coerce_champion_ids(
        _get_row_value(game_row, "enemy_champion_ids"),
        field_name="enemy_champion_ids",
    )
    player_champion_id = int(
        _get_row_value(game_row, "player_champion_id", _get_row_value(game_row, "championId"))
    )

    prior_history = _prior_history_frame(game_row, history_df)

    if prior_history.empty:
        return {
            "ally_champion_winrate_avg": 0.5,
            "enemy_champion_winrate_avg": 0.5,
            "ally_champion_games_avg": 0.0,
            "enemy_champion_games_avg": 0.0,
            "player_champion_global_winrate": 0.5,
            "player_champion_global_games": 0.0,
        }

    champion_summary = (
        prior_history.groupby("championId")
        .agg(
            champion_games=("championId", "size"),
            champion_winrate=("win", "mean"),
        )
        .reset_index()
    )
    summary_map = {
        int(row["championId"]): {
            "champion_games": float(row["champion_games"]),
            "champion_winrate": float(row["champion_winrate"]),
        }
        for _, row in champion_summary.iterrows()
    }

    def aggregate_for(champion_ids: Sequence[int]) -> tuple[float, float]:
        winrates: list[float] = []
        games: list[float] = []
        for champion_id in champion_ids:
            champion_stats = summary_map.get(int(champion_id))
            if champion_stats is None:
                winrates.append(0.5)
                games.append(0.0)
                continue
            winrates.append(champion_stats["champion_winrate"])
            games.append(champion_stats["champion_games"])
        return float(sum(winrates) / len(winrates)), float(sum(games) / len(games))

    ally_winrate_avg, ally_games_avg = aggregate_for(ally_champion_ids)
    enemy_winrate_avg, enemy_games_avg = aggregate_for(enemy_champion_ids)
    player_champion_stats = summary_map.get(player_champion_id, {"champion_games": 0.0, "champion_winrate": 0.5})

    return {
        "ally_champion_winrate_avg": ally_winrate_avg,
        "enemy_champion_winrate_avg": enemy_winrate_avg,
        "ally_champion_games_avg": ally_games_avg,
        "enemy_champion_games_avg": enemy_games_avg,
        "champion_winrate_avg_diff": float(ally_winrate_avg - enemy_winrate_avg),
        "champion_games_avg_diff": float(ally_games_avg - enemy_games_avg),
        "player_champion_global_winrate": float(player_champion_stats["champion_winrate"]),
        "player_champion_global_games": float(player_champion_stats["champion_games"]),
    }


def compute_role_prior_features(
    game_row: Mapping[str, Any] | pd.Series,
    history_df: pd.DataFrame,
) -> dict[str, float]:
    ally_champion_ids = _coerce_champion_ids(
        _get_row_value(game_row, "ally_champion_ids"),
        field_name="ally_champion_ids",
    )
    enemy_champion_ids = _coerce_champion_ids(
        _get_row_value(game_row, "enemy_champion_ids"),
        field_name="enemy_champion_ids",
    )
    ally_positions = _coerce_strings(_get_row_value(game_row, "ally_positions"), "ally_positions")
    enemy_positions = _coerce_strings(_get_row_value(game_row, "enemy_positions"), "enemy_positions")

    prior_history = _prior_history_frame(game_row, history_df)

    if prior_history.empty:
        defaults = {}
        for prefix in ("ally_role", "enemy_role"):
            defaults[f"{prefix}_champion_winrate_avg"] = 0.5
            defaults[f"{prefix}_champion_games_avg"] = 0.0
        defaults["role_champion_winrate_avg_diff"] = 0.0
        defaults["role_champion_games_avg_diff"] = 0.0
        return defaults

    prior_history = _with_draft_position(prior_history)
    role_summary = (
        prior_history.groupby(["_draft_position", "championId"])
        .agg(
            champion_games=("championId", "size"),
            champion_winrate=("win", "mean"),
        )
        .reset_index()
    )
    summary_map = {
        (str(row["_draft_position"]), int(row["championId"])): {
            "champion_games": float(row["champion_games"]),
            "champion_winrate": float(row["champion_winrate"]),
        }
        for _, row in role_summary.iterrows()
    }

    def aggregate(champion_ids: Sequence[int], positions: Sequence[str], prefix: str) -> dict[str, float]:
        winrates: list[float] = []
        games: list[float] = []
        for champion_id, position in zip(champion_ids, positions):
            stats = summary_map.get((str(position), int(champion_id)))
            if stats is None:
                winrates.append(0.5)
                games.append(0.0)
                continue
            winrates.append(stats["champion_winrate"])
            games.append(stats["champion_games"])

        return {
            f"{prefix}_champion_winrate_avg": float(sum(winrates) / len(winrates)),
            f"{prefix}_champion_games_avg": float(sum(games) / len(games)),
        }

    ally = aggregate(ally_champion_ids, ally_positions, "ally_role")
    enemy = aggregate(enemy_champion_ids, enemy_positions, "enemy_role")
    return {
        **ally,
        **enemy,
        "role_champion_winrate_avg_diff": float(
            ally["ally_role_champion_winrate_avg"] - enemy["enemy_role_champion_winrate_avg"]
        ),
        "role_champion_games_avg_diff": float(
            ally["ally_role_champion_games_avg"] - enemy["enemy_role_champion_games_avg"]
        ),
    }


def compute_lane_matchup_features(
    game_row: Mapping[str, Any] | pd.Series,
    history_df: pd.DataFrame,
) -> dict[str, float]:
    ally_puuids = _coerce_strings(_get_row_value(game_row, "ally_puuids"), "ally_puuids")
    enemy_puuids = _coerce_strings(_get_row_value(game_row, "enemy_puuids"), "enemy_puuids")
    ally_champion_ids = _coerce_champion_ids(_get_row_value(game_row, "ally_champion_ids"), "ally_champion_ids")
    enemy_champion_ids = _coerce_champion_ids(_get_row_value(game_row, "enemy_champion_ids"), "enemy_champion_ids")
    ally_positions = _coerce_strings(_get_row_value(game_row, "ally_positions"), "ally_positions")
    enemy_positions = _coerce_strings(_get_row_value(game_row, "enemy_positions"), "enemy_positions")
    game_start_timestamp_raw = _get_row_value(game_row, "gameStartTimestamp")
    game_start_timestamp = (
        int(game_start_timestamp_raw)
        if game_start_timestamp_raw is not None and not pd.isna(game_start_timestamp_raw)
        else None
    )

    prior_history = _prior_history_frame(game_row, history_df)
    if prior_history.empty:
        features: dict[str, float] = {}
        for role in ROLE_ORDER:
            role_key = role.lower()
            features[f"{role_key}_player_games_on_champ_diff"] = 0.0
            features[f"{role_key}_player_winrate_on_champ_diff"] = 0.0
            features[f"{role_key}_player_recent_winrate_diff"] = 0.0
            features[f"{role_key}_player_recent_kda_diff"] = 0.0
            features[f"{role_key}_role_champion_winrate_diff"] = 0.0
            features[f"{role_key}_role_champion_games_diff"] = 0.0
        return features

    prior_history = _with_draft_position(prior_history)
    role_summary = (
        prior_history.groupby(["_draft_position", "championId"])
        .agg(
            champion_games=("championId", "size"),
            champion_winrate=("win", "mean"),
        )
        .reset_index()
    )
    role_summary_map = {
        (str(row["_draft_position"]), int(row["championId"])): {
            "champion_games": float(row["champion_games"]),
            "champion_winrate": float(row["champion_winrate"]),
        }
        for _, row in role_summary.iterrows()
    }

    ally_role_map = {
        position: (puuid, champion_id)
        for puuid, champion_id, position in zip(ally_puuids, ally_champion_ids, ally_positions)
    }
    enemy_role_map = {
        position: (puuid, champion_id)
        for puuid, champion_id, position in zip(enemy_puuids, enemy_champion_ids, enemy_positions)
    }

    features: dict[str, float] = {}
    for role in ROLE_ORDER:
        role_key = role.lower()
        ally_puuid, ally_champion_id = ally_role_map.get(role, ("", 0))
        enemy_puuid, enemy_champion_id = enemy_role_map.get(role, ("", 0))

        ally_player = _compute_single_player_history(ally_puuid, ally_champion_id, game_start_timestamp, history_df)
        enemy_player = _compute_single_player_history(enemy_puuid, enemy_champion_id, game_start_timestamp, history_df)

        ally_role_prior = role_summary_map.get((role, int(ally_champion_id)), {"champion_games": 0.0, "champion_winrate": 0.5})
        enemy_role_prior = role_summary_map.get((role, int(enemy_champion_id)), {"champion_games": 0.0, "champion_winrate": 0.5})

        features[f"{role_key}_player_games_on_champ_diff"] = float(
            ally_player["player_games_on_champ"] - enemy_player["player_games_on_champ"]
        )
        features[f"{role_key}_player_winrate_on_champ_diff"] = float(
            ally_player["player_winrate_on_champ"] - enemy_player["player_winrate_on_champ"]
        )
        features[f"{role_key}_player_recent_winrate_diff"] = float(
            ally_player["player_recent_winrate"] - enemy_player["player_recent_winrate"]
        )
        features[f"{role_key}_player_recent_kda_diff"] = float(
            ally_player["player_recent_kda"] - enemy_player["player_recent_kda"]
        )
        features[f"{role_key}_role_champion_winrate_diff"] = float(
            ally_role_prior["champion_winrate"] - enemy_role_prior["champion_winrate"]
        )
        features[f"{role_key}_role_champion_games_diff"] = float(
            ally_role_prior["champion_games"] - enemy_role_prior["champion_games"]
        )

    return features


def compute_draft_features(
    game_row: Mapping[str, Any] | pd.Series,
    history_df: pd.DataFrame,
    champion_tags: Mapping[int, Sequence[str]] | None = None,
) -> dict[str, float]:
    """Build a draft-time feature vector for one player perspective.

    ``game_row`` is expected to include:
    - ``ally_champion_ids``: 5 allied champion ids
    - ``enemy_champion_ids``: 5 enemy champion ids
    - ``player_champion_id`` or ``championId``
    - ``gameVersion``
    - ``puuid`` or ``player_puuid`` when player history is desired
    - ``gameStartTimestamp`` for leakage-safe historical filtering
    """

    champion_tags = load_champion_tags() if champion_tags is None else champion_tags

    ally_champion_ids = _coerce_champion_ids(
        _get_row_value(game_row, "ally_champion_ids"),
        field_name="ally_champion_ids",
    )
    enemy_champion_ids = _coerce_champion_ids(
        _get_row_value(game_row, "enemy_champion_ids"),
        field_name="enemy_champion_ids",
    )

    ally_counts = compute_team_tag_counts(ally_champion_ids, champion_tags, prefix="ally")
    enemy_counts = compute_team_tag_counts(enemy_champion_ids, champion_tags, prefix="enemy")

    feature_row: dict[str, float] = {}
    feature_row.update(ally_counts)
    feature_row.update(enemy_counts)
    feature_row.update(compute_tag_differentials(ally_counts, enemy_counts))
    feature_row.update(compute_team_player_history_features(game_row, history_df))
    feature_row.update(compute_champion_prior_features(game_row, history_df))
    feature_row.update(compute_role_prior_features(game_row, history_df))
    feature_row.update(compute_lane_matchup_features(game_row, history_df))
    feature_row["patch_version"] = parse_patch_version(str(_get_row_value(game_row, "gameVersion")))

    return feature_row


def build_draft_row(
    match_participants: pd.DataFrame,
    game_version: str,
    game_start_timestamp: int,
    focus_puuid: str | None = None,
    perspective_team_id: int | None = None,
) -> dict[str, Any]:
    """Construct the input row expected by ``compute_draft_features``.

    This is a convenience helper for training dataset generation where a match's
    10 participant rows need to be turned into a single draft snapshot.
    """

    if match_participants.empty:
        raise ValueError("match_participants must include the 10 participant rows for a match")

    required_columns = {"championId", "teamId"}
    missing_columns = required_columns.difference(match_participants.columns)
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise ValueError(f"match_participants is missing required columns: {missing}")

    if focus_puuid is not None:
        player_row = match_participants.loc[match_participants["puuid"] == focus_puuid]
        if player_row.empty:
            raise ValueError(f"focus_puuid {focus_puuid} is not present in this match")
        player_row = player_row.iloc[0]
        perspective_team_id = int(player_row["teamId"])
    elif perspective_team_id is None:
        perspective_team_id = 100
        player_row = match_participants.loc[match_participants["teamId"] == perspective_team_id].iloc[0]
    else:
        player_row = match_participants.loc[match_participants["teamId"] == perspective_team_id].iloc[0]

    perspective_team_id = int(perspective_team_id)
    enemy_team_id = 200 if perspective_team_id == 100 else 100

    ally_rows = _ordered_team_rows(match_participants, perspective_team_id)
    enemy_rows = _ordered_team_rows(match_participants, enemy_team_id)

    ally_champion_ids = ally_rows["championId"].astype(int).tolist()
    enemy_champion_ids = enemy_rows["championId"].astype(int).tolist()
    ally_puuids = ally_rows["puuid"].fillna("").astype(str).tolist()
    enemy_puuids = enemy_rows["puuid"].fillna("").astype(str).tolist()
    ally_positions = ally_rows["_draft_position"].fillna("UNKNOWN").astype(str).tolist()
    enemy_positions = enemy_rows["_draft_position"].fillna("UNKNOWN").astype(str).tolist()
    ally_summoner1_ids = ally_rows.get("summoner1Id", pd.Series([None] * len(ally_rows))).tolist()
    ally_summoner2_ids = ally_rows.get("summoner2Id", pd.Series([None] * len(ally_rows))).tolist()
    enemy_summoner1_ids = enemy_rows.get("summoner1Id", pd.Series([None] * len(enemy_rows))).tolist()
    enemy_summoner2_ids = enemy_rows.get("summoner2Id", pd.Series([None] * len(enemy_rows))).tolist()

    return {
        "puuid": player_row.get("puuid"),
        "player_puuid": player_row.get("puuid"),
        "championId": int(player_row["championId"]),
        "player_champion_id": int(player_row["championId"]),
        "teamId": perspective_team_id,
        "ally_champion_ids": ally_champion_ids,
        "enemy_champion_ids": enemy_champion_ids,
        "ally_puuids": ally_puuids,
        "enemy_puuids": enemy_puuids,
        "ally_positions": ally_positions,
        "enemy_positions": enemy_positions,
        "ally_summoner1_ids": ally_summoner1_ids,
        "ally_summoner2_ids": ally_summoner2_ids,
        "enemy_summoner1_ids": enemy_summoner1_ids,
        "enemy_summoner2_ids": enemy_summoner2_ids,
        "gameVersion": game_version,
        "gameStartTimestamp": int(game_start_timestamp),
    }

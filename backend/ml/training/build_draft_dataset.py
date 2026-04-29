from __future__ import annotations

from pathlib import Path

import pandas as pd

from ml.features.draft_features import ROLE_ORDER, build_draft_row, compute_draft_features


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
MATCH_PARTICIPANTS_PATH = DATA_DIR / "match_participants.csv"
MATCHES_PATH = DATA_DIR / "matches.csv"
DRAFT_TRAINING_PATH = DATA_DIR / "draft_training.csv"

BLUE_TEAM_ID = 100
RED_TEAM_ID = 200


def _position_series(frame: pd.DataFrame) -> pd.Series:
    if "teamPosition" in frame.columns:
        position_series = frame["teamPosition"].fillna("").astype(str).str.strip()
        if "individualPosition" in frame.columns:
            fallback_series = frame["individualPosition"].fillna("UNKNOWN").astype(str)
            return position_series.where(position_series != "", fallback_series)
        return position_series.replace("", "UNKNOWN")

    if "individualPosition" in frame.columns:
        return frame["individualPosition"].fillna("UNKNOWN").astype(str)

    raise ValueError("participants frame is missing both teamPosition and individualPosition")


def _ordered_team_rows(match_participants: pd.DataFrame, team_id: int) -> pd.DataFrame:
    team_rows = match_participants.loc[match_participants["teamId"] == team_id].copy()
    if team_rows.empty:
        raise ValueError(f"match is missing team {team_id} participants")

    role_rank = {role: index for index, role in enumerate(ROLE_ORDER)}
    team_rows["_draft_position"] = _position_series(team_rows)
    team_rows["_role_rank"] = team_rows["_draft_position"].map(role_rank).fillna(len(role_rank))
    team_rows = team_rows.sort_values(["_role_rank", "championId", "puuid"]).drop(columns="_role_rank")
    return team_rows.reset_index(drop=True)


def load_source_frames() -> tuple[pd.DataFrame, pd.DataFrame]:
    participant_header = pd.read_csv(MATCH_PARTICIPANTS_PATH, nrows=0)
    participant_columns = participant_header.columns.tolist()
    participant_usecols = [
        column
        for column in [
            "gameId",
            "puuid",
            "kills",
            "deaths",
            "assists",
            "championId",
            "teamId",
            "individualPosition",
            "teamPosition",
            "summoner1Id",
            "summoner2Id",
            "win",
        ]
        if column in participant_columns
    ]

    participants = pd.read_csv(
        MATCH_PARTICIPANTS_PATH,
        usecols=participant_usecols,
    )
    matches = pd.read_csv(
        MATCHES_PATH,
        usecols=["gameId", "gameStartTimestamp", "gameVersion"],
    )

    participants["championId"] = participants["championId"].astype(int)
    participants["teamId"] = participants["teamId"].astype(int)
    participants["win"] = participants["win"].astype(bool)
    if "teamPosition" not in participants.columns:
        participants["teamPosition"] = participants["individualPosition"]
    matches["gameStartTimestamp"] = matches["gameStartTimestamp"].astype("int64")

    return participants, matches


def _impute_missing_with_median(frame: pd.DataFrame, feature_columns: list[str]) -> pd.DataFrame:
    result = frame.copy()
    for column in feature_columns:
        if result[column].isna().any():
            median_value = float(result[column].median())
            result[column] = result[column].fillna(median_value)
    return result


def build_draft_training_frame() -> pd.DataFrame:
    participants, matches = load_source_frames()
    merged = participants.merge(matches, on="gameId", how="inner")
    merged = merged.sort_values(["gameStartTimestamp", "gameId", "teamId"]).reset_index(drop=True)

    rows: list[dict[str, object]] = []
    grouped_matches = merged.groupby("gameId", sort=False)
    total_matches = len(grouped_matches)

    # Team-perspective rows line up with a future endpoint that accepts ally and
    # enemy puuids plus the full 10-champion draft. That lets us aggregate
    # familiarity across all players instead of duplicating one team outcome once
    # for every participant.
    for index, (game_id, match_participants) in enumerate(grouped_matches, start=1):
        if len(match_participants) != 10:
            continue

        blue_team = _ordered_team_rows(match_participants, BLUE_TEAM_ID)
        red_team = _ordered_team_rows(match_participants, RED_TEAM_ID)
        if len(blue_team) != 5 or len(red_team) != 5:
            continue

        match_meta = match_participants.iloc[0]
        blue_win = bool(blue_team.iloc[0]["win"])
        winning_team = BLUE_TEAM_ID if blue_win else RED_TEAM_ID

        for team_rows, perspective_team_id in ((blue_team, BLUE_TEAM_ID), (red_team, RED_TEAM_ID)):
            focus_row = team_rows.iloc[0]
            draft_row = build_draft_row(
                match_participants=match_participants,
                game_version=str(match_meta["gameVersion"]),
                game_start_timestamp=int(match_meta["gameStartTimestamp"]),
                focus_puuid=str(focus_row["puuid"]) if pd.notna(focus_row["puuid"]) else None,
                perspective_team_id=perspective_team_id,
            )

            feature_row = compute_draft_features(draft_row, history_df=merged)
            team_win = int(perspective_team_id == winning_team)

            rows.append(
                {
                    "gameId": int(game_id),
                    "gameStartTimestamp": int(match_meta["gameStartTimestamp"]),
                    "gameVersion": str(match_meta["gameVersion"]),
                    "perspective_team_id": perspective_team_id,
                    "player_puuid": focus_row["puuid"],
                    "player_position": str(focus_row.get("_draft_position", focus_row["individualPosition"])),
                    "player_championId": int(focus_row["championId"]),
                    "winning_team": winning_team,
                    "team_win": team_win,
                    **feature_row,
                }
            )

        if index % 250 == 0 or index == total_matches:
            print(f"Processed {index}/{total_matches} matches", flush=True)

    if not rows:
        raise RuntimeError("No draft training rows were generated from the export data")

    draft_df = pd.DataFrame(rows).sort_values(["gameStartTimestamp", "gameId"]).reset_index(drop=True)

    feature_columns = [
        column
        for column in draft_df.columns
        if column
        not in {
            "gameId",
            "gameStartTimestamp",
            "gameVersion",
            "perspective_team_id",
            "player_puuid",
            "player_position",
            "player_championId",
            "winning_team",
            "team_win",
        }
    ]

    return _impute_missing_with_median(draft_df, feature_columns)


def print_data_quality_summary(draft_df: pd.DataFrame, participants: pd.DataFrame) -> None:
    print("Data quality summary", flush=True)
    print(f"  total rows: {len(draft_df)}", flush=True)

    class_balance = draft_df["team_win"].value_counts(normalize=True).sort_index()
    print("  class balance:", flush=True)
    for label, pct in class_balance.items():
        print(f"    team_win={label}: {pct:.2%}", flush=True)

    missing_counts = draft_df.isna().sum()
    nonzero_missing = missing_counts[missing_counts > 0]
    print("  missing values per column:", flush=True)
    if nonzero_missing.empty:
        print("    none", flush=True)
    else:
        for column, count in nonzero_missing.items():
            print(f"    {column}: {int(count)}", flush=True)

    unique_champion_count = int(participants["championId"].nunique())
    print(f"  unique champions in source data: {unique_champion_count}", flush=True)
    print(f"  unique matches represented: {int(draft_df['gameId'].nunique())}", flush=True)

    feature_columns = [
        column
        for column in draft_df.columns
        if column
        not in {
            "gameId",
            "gameStartTimestamp",
            "gameVersion",
            "perspective_team_id",
            "player_puuid",
            "player_position",
            "player_championId",
            "winning_team",
            "team_win",
        }
    ]
    print(f"  feature columns: {len(feature_columns)}", flush=True)


def main() -> None:
    participants, _ = load_source_frames()
    draft_df = build_draft_training_frame()

    DRAFT_TRAINING_PATH.parent.mkdir(parents=True, exist_ok=True)
    draft_df.to_csv(DRAFT_TRAINING_PATH, index=False)

    print_data_quality_summary(draft_df, participants)
    print(f"Saved draft dataset to {DRAFT_TRAINING_PATH}", flush=True)
    print(f"Verified row count: {len(draft_df)}", flush=True)


if __name__ == "__main__":
    main()

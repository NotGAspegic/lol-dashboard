from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
from joblib import dump
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBClassifier

from ml.features.tilt_features import compute_tilt_features


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"


def load_training_frame(window: int = 10) -> pd.DataFrame:
    participants = pd.read_csv(
        DATA_DIR / "match_participants.csv",
        usecols=["puuid", "gameId", "kills", "deaths", "assists", "win", "championId"],
    )
    matches = pd.read_csv(DATA_DIR / "matches.csv", usecols=["gameId", "gameStartTimestamp"])

    merged = participants.merge(matches, on="gameId", how="left")
    merged = merged.dropna(subset=["gameStartTimestamp"]).copy()
    merged["gameStartTimestamp"] = merged["gameStartTimestamp"].astype("int64")

    eligible_puuids = merged.groupby("puuid", sort=False).size()
    eligible_puuids = eligible_puuids[eligible_puuids >= window].index.tolist()

    feature_frames: list[pd.DataFrame] = []
    total_players = len(eligible_puuids)

    for index, puuid in enumerate(eligible_puuids, start=1):
        player_games = merged.loc[merged["puuid"] == puuid]
        ordered_games = player_games.sort_values("gameStartTimestamp", ascending=False).reset_index(drop=True)
        features = compute_tilt_features(ordered_games, window=window)
        if features.empty:
            continue

        features = features.copy()
        features["puuid"] = puuid
        feature_frames.append(features)

        if index % 500 == 0 or index == total_players:
            print(f"Processed {index}/{total_players} eligible summoners", flush=True)

    if not feature_frames:
        raise RuntimeError("No tilt feature rows were generated from the export data")

    return pd.concat(feature_frames, ignore_index=True)


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print("Building tilt training dataset...", flush=True)
    dataset = load_training_frame(window=10)
    print(
        f"Built tilt dataset with {len(dataset)} rows from {dataset['puuid'].nunique()} summoners",
        flush=True,
    )

    label_counts = dataset["tilt"].value_counts().sort_index()
    label_distribution = (label_counts / len(dataset)).round(4)
    print("Label distribution:", flush=True)
    for label, count in label_counts.items():
        pct = label_distribution.loc[label]
        print(f"  tilt={label}: {count} ({pct:.2%})", flush=True)

    median_timestamp = int(dataset["game_start_timestamp"].median())
    train_mask = dataset["game_start_timestamp"] <= median_timestamp
    train_df = dataset.loc[train_mask].reset_index(drop=True)
    test_df = dataset.loc[~train_mask].reset_index(drop=True)

    feature_columns = [
        "consecutive_losses",
        "kda_slope",
        "death_trend",
        "inter_game_minutes_mean",
        "inter_game_minutes_min",
        "champ_variety",
        "win_rate_window",
        "avg_kda_window",
        "career_kda",
    ]

    X_train = train_df[feature_columns]
    y_train = train_df["tilt"]
    X_test = test_df[feature_columns]
    y_test = test_df["tilt"]

    print(f"Train rows: {len(train_df)} | Test rows: {len(test_df)}", flush=True)
    print(f"Median gameStartTimestamp split: {median_timestamp}", flush=True)

    pipeline = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                XGBClassifier(
                    n_estimators=200,
                    max_depth=4,
                    learning_rate=0.05,
                    scale_pos_weight=8,
                    use_label_encoder=False,
                    eval_metric="logloss",
                    tree_method="hist",
                    random_state=42,
                ),
            ),
        ]
    )

    print("Fitting model...", flush=True)
    pipeline.fit(X_train, y_train)

    y_proba = pipeline.predict_proba(X_test)[:, 1]
    y_pred = (y_proba >= 0.5).astype(int)

    auc = roc_auc_score(y_test, y_proba)
    cm = confusion_matrix(y_test, y_pred)
    report = classification_report(y_test, y_pred, zero_division=0)

    print(f"Held-out ROC AUC: {auc:.4f}", flush=True)
    print("Confusion matrix:", flush=True)
    print(cm, flush=True)
    print("Classification report:", flush=True)
    print(report, flush=True)

    model_path = MODELS_DIR / "tilt_v1.pkl"
    features_path = MODELS_DIR / "tilt_v1_features.json"

    dump(pipeline, model_path)
    features_path.write_text(json.dumps(feature_columns, indent=2))

    print(f"Saved model to {model_path}", flush=True)
    print(f"Saved feature names to {features_path}", flush=True)


if __name__ == "__main__":
    main()
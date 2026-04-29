from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
from joblib import dump
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score
from xgboost import XGBClassifier


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
DRAFT_DATASET_PATH = DATA_DIR / "draft_training.csv"


@dataclass
class DraftTrainingArtifacts:
    model: XGBClassifier
    feature_columns: list[str]
    dataset_rows: int
    train_rows: int
    test_rows: int
    test_auc: float


def load_training_frame() -> pd.DataFrame:
    dataset = pd.read_csv(DRAFT_DATASET_PATH)
    dataset = dataset.sort_values(["gameStartTimestamp", "gameId"]).reset_index(drop=True)
    return dataset


def get_feature_columns(dataset: pd.DataFrame) -> list[str]:
    excluded = {
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
    return [
        column
        for column in dataset.columns
        if (
            column not in excluded
            and not column.startswith("player_")
            and pd.api.types.is_numeric_dtype(dataset[column])
        )
    ]


def train_draft_model() -> DraftTrainingArtifacts:
    print("Loading draft training dataset...", flush=True)
    dataset = load_training_frame()
    print(f"Loaded {len(dataset)} draft rows", flush=True)

    feature_columns = get_feature_columns(dataset)

    ordered_matches = (
        dataset[["gameId", "gameStartTimestamp"]]
        .drop_duplicates()
        .sort_values(["gameStartTimestamp", "gameId"])
        .reset_index(drop=True)
    )
    split_index = int(len(ordered_matches) * 0.7)
    train_match_ids = set(ordered_matches.iloc[:split_index]["gameId"].tolist())
    test_match_ids = set(ordered_matches.iloc[split_index:]["gameId"].tolist())

    train_df = dataset.loc[dataset["gameId"].isin(train_match_ids)].reset_index(drop=True)
    test_df = dataset.loc[dataset["gameId"].isin(test_match_ids)].reset_index(drop=True)

    X_train = train_df[feature_columns]
    y_train = train_df["team_win"]
    X_test = test_df[feature_columns]
    y_test = test_df["team_win"]

    print(f"Train rows: {len(train_df)} | Test rows: {len(test_df)}", flush=True)
    print(f"Feature columns: {len(feature_columns)}", flush=True)
    print(
        "Time split:",
        f"train matches={len(train_match_ids)}",
        f"test matches={len(test_match_ids)}",
        f"train <= {int(train_df['gameStartTimestamp'].max())}",
        f"test >= {int(test_df['gameStartTimestamp'].min())}",
        flush=True,
    )

    model = XGBClassifier(
        n_estimators=300,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        tree_method="hist",
        random_state=42,
    )

    print("Fitting draft model...", flush=True)
    model.fit(X_train, y_train)

    y_proba = model.predict_proba(X_test)[:, 1]
    y_pred = (y_proba >= 0.5).astype(int)

    auc = roc_auc_score(y_test, y_proba)
    cm = confusion_matrix(y_test, y_pred)
    report = classification_report(y_test, y_pred, zero_division=0)
    importances = (
        pd.Series(model.feature_importances_, index=feature_columns)
        .sort_values(ascending=False)
        .head(10)
    )

    print(f"Held-out ROC AUC: {auc:.4f}", flush=True)
    if auc < 0.55:
        print("Warning: AUC is below the target floor of 0.55", flush=True)
    print("Confusion matrix:", flush=True)
    print(cm, flush=True)
    print("Classification report:", flush=True)
    print(report, flush=True)
    print("Top 10 feature importances:", flush=True)
    print(importances.to_string(), flush=True)

    return DraftTrainingArtifacts(
        model=model,
        feature_columns=feature_columns,
        dataset_rows=len(dataset),
        train_rows=len(train_df),
        test_rows=len(test_df),
        test_auc=float(auc),
    )


def save_draft_artifacts(artifacts: DraftTrainingArtifacts) -> tuple[Path, Path]:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = MODELS_DIR / "draft_v1.pkl"
    features_path = MODELS_DIR / "draft_v1_features.json"

    dump(artifacts.model, model_path)
    features_path.write_text(json.dumps(artifacts.feature_columns, indent=2) + "\n")

    print(f"Saved model to {model_path}", flush=True)
    print(f"Saved feature names to {features_path}", flush=True)
    return model_path, features_path


def main() -> None:
    artifacts = train_draft_model()
    save_draft_artifacts(artifacts)


if __name__ == "__main__":
    main()

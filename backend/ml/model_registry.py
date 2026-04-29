from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from joblib import load as joblib_load


BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"
TILT_MODEL_PATH = MODELS_DIR / "tilt_v1.pkl"
TILT_FEATURES_PATH = MODELS_DIR / "tilt_v1_features.json"
TILT_META_PATH = MODELS_DIR / "tilt_v1_meta.json"
DRAFT_MODEL_PATH = MODELS_DIR / "draft_v1.pkl"
DRAFT_FEATURES_PATH = MODELS_DIR / "draft_v1_features.json"
DRAFT_META_PATH = MODELS_DIR / "draft_v1_meta.json"
DRAFT_DATASET_PATH = DATA_DIR / "draft_training.csv"


@lru_cache(maxsize=1)
def load_tilt_model() -> Any:
    return joblib_load(TILT_MODEL_PATH)


@lru_cache(maxsize=1)
def load_tilt_feature_names() -> list[str]:
    return json.loads(TILT_FEATURES_PATH.read_text())


@lru_cache(maxsize=1)
def load_tilt_metadata() -> dict[str, Any]:
    return json.loads(TILT_META_PATH.read_text())


@lru_cache(maxsize=1)
def load_draft_model() -> Any:
    return joblib_load(DRAFT_MODEL_PATH)


@lru_cache(maxsize=1)
def load_draft_feature_names() -> list[str]:
    return json.loads(DRAFT_FEATURES_PATH.read_text())


@lru_cache(maxsize=1)
def load_draft_metadata() -> dict[str, Any]:
    return json.loads(DRAFT_META_PATH.read_text())


@lru_cache(maxsize=1)
def load_draft_training_match_count() -> int:
    if not DRAFT_DATASET_PATH.exists():
        return 0

    unique_match_ids: set[str] = set()
    with DRAFT_DATASET_PATH.open() as handle:
        header = handle.readline().strip().split(",")
        if "gameId" not in header:
            return 0
        game_id_index = header.index("gameId")

        for line in handle:
            fields = line.strip().split(",")
            if game_id_index >= len(fields):
                continue
            unique_match_ids.add(fields[game_id_index])

    return len(unique_match_ids)


@lru_cache(maxsize=1)
def load_model_registry() -> dict[str, dict[str, Any]]:
    return {
        "tilt_v1": {
            "model": load_tilt_model(),
            "feature_names": load_tilt_feature_names(),
            "metadata": load_tilt_metadata(),
        },
        "draft_v1": {
            "model": load_draft_model(),
            "feature_names": load_draft_feature_names(),
            "metadata": load_draft_metadata(),
            "training_matches": load_draft_training_match_count(),
        },
    }


def clear_model_registry_caches() -> None:
    load_tilt_model.cache_clear()
    load_tilt_feature_names.cache_clear()
    load_tilt_metadata.cache_clear()
    load_draft_model.cache_clear()
    load_draft_feature_names.cache_clear()
    load_draft_metadata.cache_clear()
    load_draft_training_match_count.cache_clear()
    load_model_registry.cache_clear()

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from joblib import load as joblib_load


BASE_DIR = Path(__file__).resolve().parent
MODELS_DIR = BASE_DIR / "models"
TILT_MODEL_PATH = MODELS_DIR / "tilt_v1.pkl"
TILT_FEATURES_PATH = MODELS_DIR / "tilt_v1_features.json"


@lru_cache(maxsize=1)
def load_tilt_model() -> Any:
    return joblib_load(TILT_MODEL_PATH)


@lru_cache(maxsize=1)
def load_tilt_feature_names() -> list[str]:
    return json.loads(TILT_FEATURES_PATH.read_text())


@lru_cache(maxsize=1)
def load_model_registry() -> dict[str, dict[str, Any]]:
    return {
        "tilt_v1": {
            "model": load_tilt_model(),
            "feature_names": load_tilt_feature_names(),
        }
    }
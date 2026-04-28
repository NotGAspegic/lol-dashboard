from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import shap
import pandas as pd
from joblib import load

from ml.features.shap_reasons import top_reasons


BASE_DIR = Path(__file__).resolve().parents[1]
MODELS_DIR = BASE_DIR / "models"
MODEL_PATH = MODELS_DIR / "tilt_v1.pkl"
FEATURES_PATH = MODELS_DIR / "tilt_v1_features.json"


@lru_cache(maxsize=1)
def load_tilt_pipeline() -> tuple[Any, list[str]]:
    pipeline = load(MODEL_PATH)
    feature_names = json.loads(FEATURES_PATH.read_text())
    return pipeline, feature_names


def _feature_vector_to_list(
    feature_vector: Mapping[str, float] | Sequence[float],
    feature_names: Sequence[str],
) -> list[float]:
    if isinstance(feature_vector, Mapping):
        missing = [name for name in feature_names if name not in feature_vector]
        if missing:
            missing_names = ", ".join(missing)
            raise ValueError(f"feature_vector is missing required keys: {missing_names}")
        return [float(feature_vector[name]) for name in feature_names]

    values = list(feature_vector)
    if len(values) != len(feature_names):
        raise ValueError("feature_vector length does not match the saved feature list")
    return [float(value) for value in values]


def predict_tilt(
    feature_vector: Mapping[str, float] | Sequence[float],
    n_reasons: int = 3,
) -> dict[str, Any]:
    pipeline, feature_names = load_tilt_pipeline()
    raw_feature_values = _feature_vector_to_list(feature_vector, feature_names)
    feature_frame = pd.DataFrame([raw_feature_values], columns=feature_names)

    scaled_x = pipeline.named_steps["scaler"].transform(feature_frame)
    clf = pipeline.named_steps["clf"]
    explainer = shap.TreeExplainer(clf)
    shap_values = explainer.shap_values(scaled_x)

    if isinstance(shap_values, (list, tuple)):
        positive_class_shap = shap_values[-1]
    else:
        positive_class_shap = shap_values

    if isinstance(positive_class_shap, np.ndarray) and positive_class_shap.ndim == 2:
        positive_class_shap = positive_class_shap[0]

    tilt_probability = float(pipeline.predict_proba(feature_frame)[0][1])
    reasons = top_reasons(positive_class_shap, feature_names, raw_feature_values, n=n_reasons)

    return {
        "tilt_probability": tilt_probability,
        "reasons": reasons,
        "feature_names": feature_names,
        "feature_values": raw_feature_values,
    }
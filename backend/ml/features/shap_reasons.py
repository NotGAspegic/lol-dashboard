from __future__ import annotations

from collections.abc import Sequence

import numpy as np


FEATURE_TEMPLATES = {
    "consecutive_losses": lambda v: f"You've lost {int(v)} games in a row",
    "kda_slope": lambda v: f"Your KDA has been {'improving' if v > 0 else 'declining'} recently ({v:+.2f}/game)",
    "death_trend": lambda v: f"Deaths are {'rising' if v > 0 else 'falling'} recently ({v:+.2f}/game)",
    "inter_game_minutes_mean": lambda v: f"Your average queue gap is {v:.0f} minutes",
    "inter_game_minutes_min": lambda v: f"You've been queuing very quickly (min gap: {v:.0f} min)",
    "inter_game_min": lambda v: f"You've been queuing very quickly (min gap: {v:.0f} min)",
    "champ_variety": lambda v: f"You've played {int(v)} different champions recently",
    "win_rate_window": lambda v: f"Your recent win rate is {v * 100:.0f}%",
    "avg_kda_window": lambda v: f"Your recent average KDA is {v:.2f}",
    "career_kda": lambda v: f"Your career KDA is {v:.2f}",
}


def _select_shap_row(shap_vals: np.ndarray | Sequence[np.ndarray]) -> np.ndarray:
    if isinstance(shap_vals, (list, tuple)):
        if not shap_vals:
            return np.asarray([])
        selected = shap_vals[-1]
    else:
        selected = shap_vals

    selected_array = np.asarray(selected)
    if selected_array.ndim == 2:
        if selected_array.shape[0] == 0:
            return np.asarray([])
        return selected_array[0]
    return selected_array


def top_reasons(
    shap_vals: np.ndarray | Sequence[np.ndarray],
    feature_names: Sequence[str],
    feature_values: Sequence[float],
    n: int = 3,
) -> list[str]:
    selected_shap = _select_shap_row(shap_vals)
    feature_names_list = list(feature_names)
    feature_values_list = list(feature_values)

    if len(feature_names_list) != len(feature_values_list):
        raise ValueError("feature_names and feature_values must have the same length")
    if len(selected_shap) != len(feature_names_list):
        raise ValueError("shap_vals must align with feature_names")

    ranked = sorted(
        zip(feature_names_list, selected_shap, feature_values_list),
        key=lambda item: abs(float(item[1])),
        reverse=True,
    )

    reasons: list[str] = []
    for feature_name, _, feature_value in ranked[:n]:
        template = FEATURE_TEMPLATES.get(feature_name)
        if template is None:
            reasons.append(f"{feature_name} contributed to this prediction")
            continue
        reasons.append(template(float(feature_value)))

    return reasons
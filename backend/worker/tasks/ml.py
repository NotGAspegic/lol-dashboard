from __future__ import annotations

import logging
from typing import Any

from celery import shared_task


logger = logging.getLogger(__name__)


@shared_task(
    name="worker.tasks.ml.retrain_models_weekly",
)
def retrain_models_weekly() -> dict[str, Any]:
    """Weekly model refresh that only persists models when AUC improves materially."""
    from ml.retrain import run_retrain_pipeline

    results = run_retrain_pipeline(min_improvement=0.01)
    payload = {
        model_name: {
            "test_auc": result.test_auc,
            "previous_auc": result.previous_auc,
            "updated": result.updated,
            "training_samples": result.training_samples,
        }
        for model_name, result in results.items()
    }

    for model_name, result in results.items():
        logger.info(
            "weekly retrain result model=%s auc=%.4f previous_auc=%s updated=%s samples=%s",
            model_name,
            result.test_auc,
            "none" if result.previous_auc is None else f"{result.previous_auc:.4f}",
            result.updated,
            result.training_samples,
        )

    return payload

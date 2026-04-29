from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ml.export_data import main as export_data_main
from ml.model_registry import (
    DRAFT_META_PATH,
    TILT_META_PATH,
    clear_model_registry_caches,
)
from ml.training.build_draft_dataset import main as build_draft_dataset_main
from ml.training.train_draft import DraftTrainingArtifacts, save_draft_artifacts, train_draft_model
from ml.training.train_tilt import TiltTrainingArtifacts, save_tilt_artifacts, train_tilt_model


@dataclass
class ModelRetrainResult:
    model_name: str
    trained_at: str
    training_samples: int
    test_auc: float
    feature_names: list[str]
    model_version: str
    updated: bool
    previous_auc: float | None
    improvement_threshold: float


def _read_meta(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text())


def _write_meta(path: Path, result: ModelRetrainResult) -> None:
    payload = {
        "trained_at": result.trained_at,
        "training_samples": result.training_samples,
        "test_auc": result.test_auc,
        "feature_names": result.feature_names,
        "model_version": result.model_version,
    }
    path.write_text(json.dumps(payload, indent=2) + "\n")


def _should_update(previous_auc: float | None, new_auc: float, min_improvement: float) -> bool:
    if previous_auc is None:
        return True
    improvement = new_auc - previous_auc
    if min_improvement <= 0:
        return improvement > 0
    return improvement >= min_improvement


def _retrain_single_model(
    *,
    model_name: str,
    model_version: str,
    meta_path: Path,
    train_fn: Callable[[], TiltTrainingArtifacts | DraftTrainingArtifacts],
    save_fn: Callable[[Any], tuple[Path, Path]],
    min_improvement: float,
) -> ModelRetrainResult:
    previous_meta = _read_meta(meta_path)
    previous_auc = None if previous_meta is None else float(previous_meta["test_auc"])

    artifacts = train_fn()
    should_update = _should_update(previous_auc, artifacts.test_auc, min_improvement)
    trained_at = datetime.now(timezone.utc).isoformat()

    result = ModelRetrainResult(
        model_name=model_name,
        trained_at=trained_at,
        training_samples=artifacts.dataset_rows,
        test_auc=artifacts.test_auc,
        feature_names=artifacts.feature_columns,
        model_version=model_version,
        updated=should_update,
        previous_auc=previous_auc,
        improvement_threshold=min_improvement,
    )

    if should_update:
        save_fn(artifacts)
        _write_meta(meta_path, result)
        print(
            f"[{model_name}] updated saved artifacts "
            f"(auc={artifacts.test_auc:.4f}, previous={previous_auc if previous_auc is not None else 'none'})",
            flush=True,
        )
    else:
        print(
            f"[{model_name}] kept existing artifacts "
            f"(auc={artifacts.test_auc:.4f}, previous={previous_auc:.4f}, "
            f"required_improvement={min_improvement:.4f})",
            flush=True,
        )

    return result


def run_retrain_pipeline(min_improvement: float = 0.0) -> dict[str, ModelRetrainResult]:
    print("Exporting source data...", flush=True)
    export_data_main()

    print("Rebuilding draft training dataset...", flush=True)
    build_draft_dataset_main()

    print("Retraining tilt model...", flush=True)
    tilt_result = _retrain_single_model(
        model_name="tilt_v1",
        model_version="tilt_v1",
        meta_path=TILT_META_PATH,
        train_fn=lambda: train_tilt_model(window=10),
        save_fn=save_tilt_artifacts,
        min_improvement=min_improvement,
    )

    print("Retraining draft model...", flush=True)
    draft_result = _retrain_single_model(
        model_name="draft_v1",
        model_version="draft_v1",
        meta_path=DRAFT_META_PATH,
        train_fn=train_draft_model,
        save_fn=save_draft_artifacts,
        min_improvement=min_improvement,
    )

    clear_model_registry_caches()
    return {
        "tilt_v1": tilt_result,
        "draft_v1": draft_result,
    }


def main() -> None:
    results = run_retrain_pipeline(min_improvement=0.0)
    print("Retrain summary:", flush=True)
    for result in results.values():
        previous_auc = "none" if result.previous_auc is None else f"{result.previous_auc:.4f}"
        print(
            f"  {result.model_name}: auc={result.test_auc:.4f} "
            f"previous={previous_auc} updated={result.updated}",
            flush=True,
        )


if __name__ == "__main__":
    main()

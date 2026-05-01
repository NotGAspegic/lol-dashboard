from __future__ import annotations

from prometheus_client import Counter


riot_api_requests_total = Counter(
    "riot_api_requests_total",
    "Total Riot API HTTP responses observed by the backend.",
    labelnames=("status_code",),
)

celery_tasks_total = Counter(
    "celery_tasks_total",
    "Total Celery task lifecycle events observed by workers.",
    labelnames=("task_name", "status"),
)

ml_predictions_total = Counter(
    "ml_predictions_total",
    "Total successful ML predictions served by the backend.",
    labelnames=("model_name",),
)


def record_riot_api_request(status_code: int | str) -> None:
    riot_api_requests_total.labels(status_code=str(status_code)).inc()


def record_celery_task(task_name: str, status: str) -> None:
    celery_tasks_total.labels(
        task_name=(task_name or "unknown"),
        status=(status or "unknown").lower(),
    ).inc()


def record_ml_prediction(model_name: str) -> None:
    ml_predictions_total.labels(model_name=model_name).inc()

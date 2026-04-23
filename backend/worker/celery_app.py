from celery import Celery

from config import settings

from celery.schedules import crontab

celery_app = Celery("lol_dashboard")
celery_app.set_default()
celery_app.conf.broker_url = settings.redis_url
celery_app.conf.result_backend = settings.redis_url
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.task_track_started = True
celery_app.conf.task_acks_late = True
celery_app.conf.include = ["worker.tasks.ping", "worker.tasks.ingest", "worker.tasks.refresh"]
celery_app.conf.task_routes = {
	"worker.tasks.ingest.*": {"queue": "ingestion"},
	"worker.tasks.refresh.*": {"queue": "refresh"},
	"worker.tasks.ping": {"queue": "refresh"},
}
celery_app.conf.timezone = "UTC"
celery_app.conf.beat_schedule = {
    "refresh-queue-heartbeat": {
        "task": "worker.tasks.ping",
        "schedule": 300.0,
        "options": {"queue": "refresh"},
    },
    "refresh-all-summoners": {
        "task": "worker.tasks.refresh.refresh_all_tracked_summoners",
        "schedule": crontab(hour="*/6", minute="0"),
        "options": {"queue": "refresh"},
    },
    "retry-failed-ingestions": {
    "task": "worker.tasks.ingest.retry_failed_ingestions",
    "schedule": crontab(hour="3", minute="0"),  # 3am UTC daily
    "options": {"queue": "ingestion"},
    },
}

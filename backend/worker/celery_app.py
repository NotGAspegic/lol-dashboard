from celery import Celery

from config import settings

celery_app = Celery("lol_dashboard")
celery_app.set_default()
celery_app.conf.broker_url = settings.redis_url
celery_app.conf.result_backend = settings.redis_url
celery_app.conf.task_serializer = "json"
celery_app.conf.result_serializer = "json"
celery_app.conf.accept_content = ["json"]
celery_app.conf.task_track_started = True
celery_app.conf.task_acks_late = True
celery_app.conf.include = ["worker.tasks.ping", "worker.tasks.ingest"]
celery_app.conf.task_routes = {
	"worker.tasks.ingest.*": {"queue": "ingestion"},
	"worker.tasks.refresh.*": {"queue": "refresh"},
	"worker.tasks.ping": {"queue": "refresh"},
}

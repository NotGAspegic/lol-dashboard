from celery import shared_task


@shared_task(name="worker.tasks.ping")
def ping() -> str:
    return "pong"

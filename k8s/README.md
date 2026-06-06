# Farsight Kubernetes Deployment

This folder contains a small Kubernetes deployment for the Farsight distributed
analytics platform. It is designed as a course/demo deployment that mirrors the
Docker Compose architecture:

- Next.js frontend
- FastAPI backend
- Celery ingestion worker
- Celery priority worker
- Celery Beat scheduler
- Flower queue dashboard
- Redis broker/cache
- PostgreSQL + TimescaleDB
- Alembic migration job

## Architecture

```text
Browser
  |
  v
frontend Service -> frontend Deployment
  |
  v
api Service -> api Deployment
  |             |
  |             +-> Redis Service -> redis Deployment
  |             +-> Postgres Service -> postgres StatefulSet
  |
  +-> worker Deployment
  +-> priority-worker Deployment
  +-> beat Deployment
  +-> flower Deployment
```

The API handles synchronous reads and prediction requests. The Celery workers
handle Riot ingestion and background refresh jobs. Redis is both broker and
cache. Postgres/Timescale stores match, timeline, rank snapshot, and model
training data.

## Local Demo

Build local images:

```bash
docker build -t lol_backend:dev ./backend
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -t lol_frontend:dev ./frontend
```

If you use `kind`, load the images into the cluster:

```bash
kind load docker-image lol_backend:dev
kind load docker-image lol_frontend:dev
```

If you use `minikube`, build inside the minikube Docker daemon instead:

```bash
eval "$(minikube docker-env)"
docker build -t lol_backend:dev ./backend
docker build \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 \
  -t lol_frontend:dev ./frontend
```

Edit `k8s/local/secrets.example.yaml` and set your real `RIOT_API_KEY`.

Apply:

```bash
kubectl apply -k k8s/local
```

Watch startup:

```bash
kubectl get pods -n farsight -w
kubectl logs -n farsight deploy/api
kubectl logs -n farsight job/migrate
```

Port-forward for local browsing:

```bash
kubectl port-forward -n farsight svc/frontend 3000:3000
kubectl port-forward -n farsight svc/api 8000:8000
kubectl port-forward -n farsight svc/flower 5555:5555
```

Open:

- Frontend: `http://localhost:3000`
- API health: `http://localhost:8000/api/v1/health`
- Flower: `http://localhost:5555`

## Production Notes

For a real cloud deployment, prefer:

- managed PostgreSQL/Timescale instead of the local `postgres` StatefulSet
- managed Redis instead of the local Redis Deployment
- a proper Ingress controller with TLS
- external secret management instead of checked-in placeholder secrets
- image tags from a registry instead of `:dev`

## Exam Talking Points

- Docker Compose is used for local development.
- Kubernetes separates orchestration from application code.
- API, worker, scheduler, broker, and database are independently deployable.
- Celery workers can scale horizontally for ingestion throughput.
- Redis supports both queueing and caching.
- Postgres/Timescale supports relational and time-series data.
- Health probes protect the API from receiving traffic before dependencies are ready.
- HPA demonstrates cloud-native autoscaling for API and ingestion workers.
- Rank snapshots and ML retraining jobs show scheduled distributed workloads.

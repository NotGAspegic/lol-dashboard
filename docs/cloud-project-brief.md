# Farsight: Cloud-Native Distributed Analytics Platform

## Project Summary

Farsight is a distributed analytics platform for League of Legends match data.
It ingests player match history from the Riot API, stores relational and
time-series data, serves machine-learning predictions, and exposes the results
through a web dashboard.

The project demonstrates cloud-computing and distributed-systems concepts by
separating the application into independently deployable services:

- frontend dashboard
- FastAPI backend
- Redis broker/cache
- Celery ingestion worker
- Celery priority worker
- Celery Beat scheduler
- Flower task-monitoring dashboard
- PostgreSQL/TimescaleDB database
- ML retraining and model-serving pipeline

## Why This Is a Cloud/Distributed Systems Project

The system is not a single-process application. API requests, background data
ingestion, scheduled retraining, cache access, and database writes happen across
different services.

Key distributed concepts:

- service decomposition
- asynchronous task queues
- message broker coordination
- worker horizontal scaling
- database persistence and time-series storage
- cache-backed API reads
- external API rate-limit handling
- health checks and readiness probes
- container orchestration with Kubernetes
- scheduled workloads through Celery Beat
- model lifecycle and retraining metadata

## Architecture

```text
User Browser
  |
  v
Next.js Frontend
  |
  v
FastAPI Backend
  |-----------------------------|
  v                             v
Redis Broker/Cache        PostgreSQL + TimescaleDB
  |
  |---- Celery Ingestion Worker
  |---- Celery Priority Worker
  |---- Celery Beat Scheduler
  |---- Flower Dashboard
```

## Data Flow

1. A user searches for a Riot ID.
2. The API resolves the account through Riot's account API.
3. The API queues background ingestion through Celery.
4. Workers fetch match and timeline data while respecting Riot rate limits.
5. Data is stored in PostgreSQL/TimescaleDB.
6. The dashboard reads summaries, charts, and prediction results from FastAPI.
7. ML models serve tilt and draft predictions from saved artifacts.
8. Weekly jobs refresh model artifacts and rank snapshots.

## Kubernetes Work

The repository includes Kubernetes manifests under `k8s/`.

Included workloads:

- API Deployment and Service
- Frontend Deployment and Service
- Celery worker Deployment
- Priority worker Deployment
- Beat Deployment
- Flower Deployment and Service
- Redis Deployment and Service
- TimescaleDB/Postgres StatefulSet and Service
- Alembic migration Job
- HorizontalPodAutoscalers for API and ingestion worker
- ConfigMap and Secret wiring

This makes the project suitable for local Kubernetes demos using `kind`,
`minikube`, Docker Desktop Kubernetes, or a managed cluster with small changes.

## Production Direction

For production, the best deployment split is:

- Vercel or containerized Kubernetes Deployment for the frontend
- Kubernetes Deployment for FastAPI
- Kubernetes Deployments for Celery workers and Beat
- managed PostgreSQL/TimescaleDB if available
- managed Redis
- external secret manager
- container registry image tags
- Ingress controller with TLS
- Prometheus/Grafana observability

## Interview Demo Plan

1. Show Docker Compose local services.
2. Explain the asynchronous ingestion pipeline.
3. Show Redis/Celery/Flower task processing.
4. Show PostgreSQL/Timescale tables for match and timeline data.
5. Open the profile dashboard and explain API-backed charts.
6. Show ML model status and prediction endpoints.
7. Show Kubernetes manifests and explain how each service maps to a workload.
8. Discuss scaling workers independently from API pods.
9. Discuss rate limiting and fault isolation.
10. Discuss production improvements and cloud provider choices.

## Known Limitations

- Local Kubernetes manifests use an in-cluster Postgres for demo simplicity.
- Real production should use managed durable storage.
- The draft model is functional but still has limited predictive strength.
- Historical LP charts become richer as rank snapshots accumulate over time.
- Riot API development keys have strict rate limits and expire periodically.

## Possible Exam Questions

- Why use Celery instead of doing ingestion directly inside API requests?
- What happens when Riot rate-limits the system?
- How can workers be scaled independently?
- Why use Redis as both cache and broker?
- What should be moved to managed services in production?
- How do Kubernetes readiness probes improve reliability?
- What is the difference between Docker Compose and Kubernetes here?
- How does the system avoid blocking frontend rendering on long-running work?
- How would you secure Riot API keys in production?
- How would you make model retraining safer?

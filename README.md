# Farsight Analytics

Deep League of Legends player analytics with timeline-aware match breakdowns, ranked profile intelligence, and ML-powered draft and tilt signals.

[Live App](https://farsight-gg.vercel.app) · [Swagger API](https://farsight-production.up.railway.app/docs) · [Architecture Blueprint](blueprints/lol_dashboard_blueprint.html)

## Hero

![Farsight dashboard hero](frontend/public/farsight.png)

The dashboard is built to answer questions that surface-level stat sites usually skip: how a game opened up, where tempo broke, how a player converts gold into pressure, and whether recent patterns suggest confidence or tilt.

Additional UI snapshot:

![Farsight graph view](frontend/public/graph.png)

Demo capture target for portfolio use:
- Search a summoner
- Let the profile load
- Switch between tabs
- Hover charts and match-level cards

Recommended tools:
- `LICEcap` on Windows or macOS
- `Peek` on Linux

## Features

- `🔎 Summoner Search` Search by Riot ID and onboard new profiles into the tracked dataset.
- `🧭 Ranked Profile Intelligence` See rank, LP history, top roles, recent tracked form, and queue-specific reads.
- `📈 Match Storytelling` Reconstruct how a game swung using gold diff, objective control, and per-player carry pressure.
- `🧪 Advanced Performance Views` Explore champion stats, matchup tables, KDA trend lines, damage efficiency, and vision impact.
- `🧠 Tilt Detection` Run a model over recent match history to flag elevated tilt risk and attach plain-English reasons.
- `⚔️ Draft Probability` Estimate blue-side win probability from composition structure plus player champion history.
- `⏱ Timeline Analytics` Query minute-level match frame data from TimescaleDB hypertables for gold and XP curve analysis.
- `🔁 Background Ingestion` Use Celery workers, Redis queues, and Riot-safe rate limiting to keep tracked profiles fresh.

## Tech Stack

```mermaid
flowchart LR
    A[Next.js 16 App Router<br/>TypeScript + Tailwind] --> B[FastAPI API]
    B --> C[(PostgreSQL)]
    B --> D[(Redis)]
    B --> E[(TimescaleDB Hypertables)]
    F[Celery Workers + Beat] --> D
    F --> C
    F --> E
    F --> G[Riot API]
    B --> H[scikit-learn + XGBoost]
    B --> I[Prometheus /metrics]
```

## Architecture

Farsight is organized around three flows:

1. `Read path`
Profiles, match pages, and charts are served by FastAPI with Redis caching to keep common lookups responsive.

2. `Ingestion path`
Celery workers fetch Riot data asynchronously, respect rate limits, and persist profile, match, and timeline data into PostgreSQL and TimescaleDB.

3. `Prediction path`
Pretrained scikit-learn and XGBoost artifacts are loaded inside the API service to produce draft and tilt inference on demand.

Blueprint:
- [System architecture blueprint](blueprints/lol_dashboard_blueprint.html)

Infrastructure highlights:
- Next.js frontend deployed on Vercel
- FastAPI backend deployed on Railway
- PostgreSQL + TimescaleDB for relational and time-series workloads
- Redis for queues, caching, and rate limiting
- Celery for ingestion fanout and scheduled refreshes

## Local Development

### Prerequisites

- Docker and Docker Compose
- Python `3.11+`
- Node.js `20+`
- A Riot API key

### 1. Configure environment

Create backend env:

```bash
cp backend/.env.example backend/.env
```

Set at least:

```env
RIOT_API_KEY=RGAPI-your-key
DATABASE_URL=postgresql+asyncpg://loluser:lolpassword@localhost:5432/loldb
REDIS_URL=redis://redis:6379/0
FRONTEND_ORIGIN=http://localhost:3000
```

Create infrastructure env:

```env
# infra/.env
POSTGRES_DB=loldb
POSTGRES_USER=loluser
POSTGRES_PASSWORD=lolpassword
```

### 2. Start local services

```bash
cd infra
docker compose up -d
```

This boots:
- `lol_postgres`
- `lol_redis`
- `lol_api`
- `lol_worker`
- `lol_priority_worker`
- `lol_beat`
- `lol_flower`
- `lol_adminer`

### 3. Install app dependencies

Backend:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

Frontend:

```bash
cd frontend
npm ci
```

### 4. Run database setup

```bash
cd backend
alembic upgrade head
```

If you want to bootstrap the hypertable path explicitly:

```bash
docker compose -f infra/docker-compose.yml exec api alembic upgrade head
docker compose -f infra/docker-compose.yml exec postgres psql -U loluser -d loldb \
  -c "SELECT create_hypertable('match_timeline_frames', 'frame_timestamp', if_not_exists => TRUE);"
```

### 5. Seed initial data

Ingest one summoner:

```bash
cd backend
python ingest.py --summoner "BehindYou#Hers" --region euw1 --count 50 --queue 420
```

### 6. Run the frontend

```bash
cd frontend
npm run dev
```

Useful local URLs:
- Frontend: `http://localhost:3000`
- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/api/v1/health`
- Flower: `http://localhost:5555`
- Adminer: `http://localhost:8080`

## API Documentation

- Live Swagger: https://farsight-production.up.railway.app/docs
- Local Swagger: http://localhost:8000/docs

The API covers:
- summoner lookup and onboarding
- ranked summary and profile statistics
- match and gold-diff endpoints
- tilt prediction
- draft prediction
- task status polling for async ingestion

## Deployment Notes

- Frontend deploy target: `Vercel`
- Backend deploy target: `Railway`
- Database: `PostgreSQL / TimescaleDB`
- Queue + cache: `Redis`

Important production notes:

- `FRONTEND_ORIGIN` must include the deployed frontend origin for CORS.
- ML inference requires model artifacts in `backend/ml/models/`.
- Meta JSON files are optional, but model and feature files are required:
  - `tilt_v1.pkl`
  - `tilt_v1_features.json`
  - `draft_v1.pkl`
  - `draft_v1_features.json`
- Railway setup notes live in [infra/railway/README.md](infra/railway/README.md).

## Results Snapshot

Recent local retraining and dataset build outputs produced:

- `91,470` participant rows exported from `9,147` matches
- `18,294` draft training rows with `0` missing values
- `172` unique champions represented in source data
- `32,082` tilt training rows built from `1,668` eligible summoners

These numbers are a good starting point for portfolio copy because they are grounded in the actual project output rather than marketing estimates.

## Repo Guide

- [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, seeding, and test workflow
- [backend/README.md](backend/README.md) for backend-specific commands
- [infra/docker-compose.yml](infra/docker-compose.yml) for local infrastructure
- [blueprints/lol_dashboard_blueprint.html](blueprints/lol_dashboard_blueprint.html) for the original system blueprint

## Riot Notice

Farsight Analytics was created under Riot Games' Legal Jibber Jabber policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

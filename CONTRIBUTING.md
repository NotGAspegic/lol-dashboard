# Contributing

Thanks for taking a look at Farsight. This guide explains how to run the project locally, ingest initial data, and verify changes before opening a pull request.

## Prerequisites

- Docker and Docker Compose
- Python `3.11+`
- Node.js `20+`
- npm
- A Riot API key

## Project Layout

- `frontend/` Next.js application
- `backend/` FastAPI API, Celery workers, ML pipeline, Alembic migrations
- `infra/` local Docker Compose and deployment-related files
- `blueprints/` planning and architecture HTML docs

## Environment Setup

### Backend environment

```bash
cp backend/.env.example backend/.env
```

Required values:

```env
RIOT_API_KEY=RGAPI-your-key
DATABASE_URL=postgresql+asyncpg://loluser:lolpassword@localhost:5432/loldb
REDIS_URL=redis://redis:6379/0
FRONTEND_ORIGIN=http://localhost:3000
```

### Infrastructure environment

Create `infra/.env`:

```env
POSTGRES_DB=loldb
POSTGRES_USER=loluser
POSTGRES_PASSWORD=lolpassword
```

## Start Local Infrastructure

```bash
cd infra
docker compose up -d
docker compose ps
```

Expected services:

- `lol_postgres`
- `lol_redis`
- `lol_api`
- `lol_worker`
- `lol_priority_worker`
- `lol_beat`
- `lol_flower`
- `lol_adminer`

## Install Dependencies

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
```

### Frontend

```bash
cd frontend
npm ci
```

## Database Setup

Run migrations:

```bash
cd backend
alembic upgrade head
```

If you want to ensure the Timescale hypertable exists:

```bash
cd infra
docker compose exec postgres psql -U loluser -d loldb \
  -c "SELECT create_hypertable('match_timeline_frames', 'frame_timestamp', if_not_exists => TRUE);"
```

## Seed Initial Data

Run the ingestion CLI with a real Riot ID:

```bash
cd backend
python ingest.py --summoner "BehindYou#Hers" --region euw1 --count 50 --queue 420
```

You can swap in any valid Riot ID and platform region.

After ingestion, a quick verification query:

```bash
PGPASSWORD=lolpassword psql -h localhost -U loluser -d loldb \
  -c "SELECT COUNT(*) AS match_participant_rows FROM match_participants;"
```

## Run the Apps

### Frontend

```bash
cd frontend
npm run dev
```

### Backend

If you want to run the backend outside Docker:

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Local URLs

- Frontend: `http://localhost:3000`
- Swagger docs: `http://localhost:8000/docs`
- API health: `http://localhost:8000/api/v1/health`
- Flower: `http://localhost:5555`
- Adminer: `http://localhost:8080`

## Running Tests

Backend checks:

```bash
cd backend
source .venv/bin/activate
ruff check .
mypy . --ignore-missing-imports
pytest tests/ -v
```

Frontend checks:

```bash
cd frontend
npm run lint
npm run build -- --webpack
```

## ML Artifacts

Draft and tilt inference require these files in `backend/ml/models/`:

- `tilt_v1.pkl`
- `tilt_v1_features.json`
- `draft_v1.pkl`
- `draft_v1_features.json`

Metadata files are optional:

- `tilt_v1_meta.json`
- `draft_v1_meta.json`

If you need to retrain locally:

```bash
cd backend
python -m ml.retrain
```

This can take a while because it rebuilds datasets from the local match corpus before training.

## Pull Request Expectations

- Keep changes scoped and explain the user-facing impact.
- Run the relevant checks before opening the PR.
- Include screenshots or a short GIF for dashboard/UI changes when possible.
- Do not commit secrets, `.env` files, or private connection strings.

## Troubleshooting

- `401 Unknown apikey`: your Riot API key is invalid or expired.
- `404 summoner not found`: check Riot ID spelling and region.
- `CORS` issues in production: verify `FRONTEND_ORIGIN` matches the deployed frontend URL.
- `missing model artifacts`: make sure the required `.pkl` and `*_features.json` files exist in `backend/ml/models/`.

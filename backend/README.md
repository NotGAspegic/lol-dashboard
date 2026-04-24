# Backend Setup Guide

This guide covers local backend setup, Docker Compose services, and the CLI ingestion workflow.

## Prerequisites

- Docker + Docker Compose
- Python 3.11+
- A valid Riot API key (development key)

## 1) Configure Environment Variables

### Backend env file

From the repository root:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and set at least:

- `RIOT_API_KEY`: your Riot developer key
- `DATABASE_URL`: local DB connection used by scripts (default points to `localhost`)
- `REDIS_URL`: local Redis connection (default is fine)
- `FRONTEND_ORIGIN`: frontend URL for CORS

Example:

```env
RIOT_API_KEY=RGAPI-your-key-goes-here
DATABASE_URL=postgresql+asyncpg://loluser:lolpassword@localhost:5432/loldb
REDIS_URL=redis://redis:6379/0
FRONTEND_ORIGIN=http://localhost:3000
```

### Docker Compose env file

Create `infra/.env` so Postgres boots with explicit credentials:

```env
POSTGRES_DB=loldb
POSTGRES_USER=loluser
POSTGRES_PASSWORD=lolpassword
```

Without these, Compose starts with warnings and blank defaults.

## 2) Start Infrastructure (Docker Compose)

From the repository root:

```bash
cd infra
docker compose up -d
docker compose ps
```

Expected services:

- `lol_postgres`
- `lol_redis`
- `lol_adminer`
- `lol_api`

## 3) Install Backend Dependencies (for CLI usage)

From the repository root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 4) Run Database Migrations (Recommended)

From `backend`:

```bash
alembic upgrade head
```

## 5) Run the CLI Ingestion Script

From `backend`:

```bash
python ingest.py --summoner "Name#TAG" --region na1 --count 50 --queue 420
```

### CLI arguments

- `--summoner` (required): Riot ID in `Name#TAG` format
- `--region` (default `na1`): platform/routing region (examples: `na1`, `euw1`, `americas`)
- `--count` (default `50`): number of match IDs to request (`1-100`)
- `--queue` (default `420`): queue filter for match history

### Examples

```bash
python ingest.py --summoner "Belmont#CHALL" --region euw1 --count 20
python ingest.py --summoner "G2 Caps#1323" --region euw1 --count 20
python ingest.py --summoner "BehindYou#Hers" --region euw1 --count 50
```

## 6) Quick Data Check

After ingestion:

```bash
PGPASSWORD=lolpassword psql -h localhost -U loluser -d loldb -c "SELECT COUNT(*) AS match_participant_rows FROM match_participants;"
```

## Troubleshooting

- `401 Unknown apikey`: your Riot key is expired or invalid. Update `backend/.env`.
- `POSTGRES_DB/USER/PASSWORD variable is not set`: add `infra/.env` as shown above.
- `404 Not Found` for a summoner on one region: try the correct platform region (for example, `euw1` vs `na1`).



## Commands
```bash
cd /home/glyph/projects/lol-dashboard/infra
docker compose down

docker compose up -d

```


## Services

| Service  | URL                   | Description              |
|----------|-----------------------|--------------------------|
| API      | http://localhost:8000 | FastAPI + Swagger docs   |
| Flower   | http://localhost:5555 | Celery queue monitor     |
| Adminer  | http://localhost:8080 | Database browser         |

## Setup

```bash
# Start all services
cd infra && docker compose up -d

# Run migrations (required on first boot or after down -v)
docker compose exec api alembic upgrade head
docker compose exec postgres psql -U loluser -d loldb \
  -c "SELECT create_hypertable('match_timeline_frames', 'frame_timestamp', if_not_exists => TRUE);"

# Ingest a summoner manually
cd backend && python ingest.py --summoner "Name#TAG" --region euw1 --count 50
```

## Beat Schedule

| Task                            | Schedule     |
|---------------------------------|--------------|
| refresh_all_tracked_summoners   | Every 6h UTC |
| retry_failed_ingestions         | 3am UTC daily|
| heartbeat ping                  | Every 5 min  |

## Manual Refresh

```bash
curl -X POST http://localhost:8000/api/v1/summoners/{puuid}/refresh
```
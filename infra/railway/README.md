# Railway Day 3 Setup

This project is ready for a Railway deployment, but the Railway account and project creation steps still need to be done in your dashboard.

## What Railway should host

- `PostgreSQL`
- `Redis`
- your backend/API service
- optional background services: `worker`, `priority_worker`, `beat`, `flower`

## Recommended database choice

Railway's default PostgreSQL template does not include TimescaleDB by default. Railway's own PostgreSQL guide says TimescaleDB is available through template marketplace options instead of the default template.

Recommended approach:

1. Create a Railway project named `farsight`.
2. Add either:
   - a TimescaleDB template from the Railway marketplace, or
   - a custom Docker/image-backed PostgreSQL service based on `timescale/timescaledb:latest-pg16`
3. Add a Redis service from the Railway marketplace.

Official references:

- https://docs.railway.com/guides/postgresql
- https://docs.railway.com/databases
- https://docs.railway.com/develop/services
- https://docs.railway.com/guides/build-a-database-service

## Variables to set in Railway

For the backend/API and worker services:

- `DATABASE_URL`
- `REDIS_URL`
- `RIOT_API_KEY`
- `RIOT_REGION`
- `RIOT_PLATFORM`
- `FRONTEND_ORIGIN`
- `ENVIRONMENT=production`
- `DEBUG=false`

Do not commit Railway connection strings to git. Keep them in Railway's `Variables` tab.

## Local connectivity checks

### PostgreSQL

Use the external connection string from Railway:

```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

If you're using TimescaleDB, also verify extension availability:

```bash
psql "$DATABASE_URL" -c "SELECT default_version, installed_version FROM pg_available_extensions WHERE name = 'timescaledb';"
```

### Redis

Use the Railway Redis URL:

```bash
redis-cli -u "$REDIS_URL" PING
```

## Apply schema and Timescale setup

From the repository root:

```bash
cd backend
.venv/bin/python scripts/bootstrap_production_db.py --database-url "$DATABASE_URL"
```

What this does:

- runs `alembic upgrade head`
- prints the PostgreSQL version
- checks whether TimescaleDB is available
- if available, enables the extension
- creates the `match_timeline_frames` hypertable if it is not already a hypertable

If you intentionally choose plain PostgreSQL without TimescaleDB:

```bash
cd backend
.venv/bin/python scripts/bootstrap_production_db.py --database-url "$DATABASE_URL" --skip-timescale
```

If you only want a read-only verification run:

```bash
cd backend
.venv/bin/python scripts/bootstrap_production_db.py --database-url "$DATABASE_URL" --check-only
```

## Railway healthchecks

Railway's deployment healthchecks are configured in the Railway dashboard, not from Docker Compose. For the API service, use:

- path: `/api/v1/health`

Railway docs:

- https://docs.railway.com/reference/healthchecks

## Day 3 definition of done

- Railway project exists
- PostgreSQL/TimescaleDB service is running
- Redis service is running
- local `psql` connects successfully
- `scripts/bootstrap_production_db.py` completes successfully against Railway
- the API can boot against Railway `DATABASE_URL` and `REDIS_URL`

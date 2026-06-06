# Azure Backend Setup

This project is now hosted on Azure. The backend currently runs on an Azure VM at `farsight.westeurope.cloudapp.azure.com`.

> Note: this repo was originally prototyped on Railway because it was easiest to set up quickly and because the free-credit window made early deployment simpler. The production backend has since moved to Azure as the long-term host.

## What Azure should host

- FastAPI backend/API service
- PostgreSQL + TimescaleDB
- Redis
- optional background workers: `worker`, `priority_worker`, `beat`, `flower`

## Recommended database choice

If you are using Azure-managed services, choose a PostgreSQL option that supports TimescaleDB or deploy TimescaleDB on a VM/container.

Recommended approach:

1. Provision PostgreSQL/TimescaleDB on Azure.
2. Provision Redis on Azure or run Redis on a VM/container.
3. Deploy the backend/API service to an Azure VM or Azure App Service.

## Variables to set in Azure

For the backend/API and worker services:

- `DATABASE_URL`
- `REDIS_URL`
- `RIOT_API_KEY`
- `RIOT_REGION`
- `RIOT_PLATFORM`
- `FRONTEND_ORIGIN`
- `ENVIRONMENT=production`
- `DEBUG=false`

Do not commit production connection strings to git. Keep them in Azure environment settings or secret configuration.

## Local connectivity checks

### PostgreSQL

Use the production `DATABASE_URL` to verify connectivity:

```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

If you are using TimescaleDB, verify the extension:

```bash
psql "$DATABASE_URL" -c "SELECT default_version, installed_version FROM pg_available_extensions WHERE name = 'timescaledb';"
```

### Redis

Use the Redis connection URL to verify connectivity:

```bash
redis-cli -u "$REDIS_URL" PING
```

## Apply schema and Timescale setup

From the repository root:

```bash
cd backend
.venv/bin/python scripts/bootstrap_production_db.py --database-url "$DATABASE_URL"
```

This performs:

- `alembic upgrade head`
- PostgreSQL version verification
- TimescaleDB extension detection
- hypertable creation for `match_timeline_frames`

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

## Healthchecks

The backend exposes a health endpoint at:

- `/api/v1/health`

If you are using Azure App Service, configure the health probe to this path.

## Current host

- Backend host: `http://farsight.westeurope.cloudapp.azure.com`
- Swagger docs: `http://farsight.westeurope.cloudapp.azure.com/docs`

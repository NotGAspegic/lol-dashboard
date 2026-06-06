#!/usr/bin/env bash
set -euo pipefail

# restore_db_on_vm.sh
# Usage on VM:
#   sudo bash restore_db_on_vm.sh /path/to/mydb.dump
# Assumes Postgres is running in the VM (either host postgres or container postgres).
# If using the postgres container (docker-compose), you can copy the dump into the container
# or use psql/pg_restore inside the container via `docker-compose exec`.

DUMP_PATH=${1:-/tmp/mydb.dump}
DB_NAME=${2:-loldb}
DB_USER=${3:-loluser}
DB_PASSWORD=${4:-change_me}

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "Dump file not found: $DUMP_PATH"
  exit 1
fi

# If host Postgres (systemd service)
if command -v psql >/dev/null 2>&1; then
  echo "Using host Postgres (psql available)."
  # Create DB and user if they don't exist
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE $DB_NAME;"
  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
  sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

  echo "Restoring dump into $DB_NAME..."
  # If dump is a custom-format pg_dump -Fc, use pg_restore; else use psql for SQL dumps
  file $DUMP_PATH | grep -q "PostgreSQL custom" && sudo -u postgres pg_restore -d "$DB_NAME" -v "$DUMP_PATH" || sudo -u postgres psql -d "$DB_NAME" -f "$DUMP_PATH"
  echo "Restore complete."
  exit 0
fi

# If using docker-compose postgres service
if docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps postgres >/dev/null 2>&1; then
  echo "Restoring into docker-compose postgres service..."
  CONTAINER=$(docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps -q postgres)
  if [[ -z "$CONTAINER" ]]; then
    echo "Postgres container not found. Ensure services are up: docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
    exit 1
  fi
  echo "Copying dump into container..."
  docker cp "$DUMP_PATH" "$CONTAINER":/tmp/mydb.dump
  echo "Creating DB and user inside container..."
  docker exec -u postgres "$CONTAINER" psql -c "CREATE DATABASE IF NOT EXISTS $DB_NAME;" || true
  docker exec -u postgres "$CONTAINER" psql -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$DB_USER') THEN CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'; END IF; END \$\$;"
  echo "Restoring dump inside container..."
  # Try pg_restore, fallback to psql
  docker exec -u postgres "$CONTAINER" pg_restore -d "$DB_NAME" -v /tmp/mydb.dump || docker exec -u postgres "$CONTAINER" psql -d "$DB_NAME" -f /tmp/mydb.dump
  echo "Restore complete inside container."
  exit 0
fi

echo "No suitable postgres found on host or in docker-compose. Please run this script on the VM where Postgres is available."
exit 1

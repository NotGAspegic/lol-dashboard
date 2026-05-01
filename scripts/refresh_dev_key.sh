#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/backend/.env"

RAILWAY_ENVIRONMENT="${RAILWAY_ENVIRONMENT:-production}"
RAILWAY_SERVICES_DEFAULT="farsight api worker priority_worker"

usage() {
  cat <<'EOF'
Usage: scripts/refresh_dev_key.sh [--service SERVICE]...

Prompts for a fresh Riot development key, updates backend/.env, pushes the
same value to Railway service variables, and restarts the affected services.

Environment variables:
  RAILWAY_ENVIRONMENT   Railway environment to target (default: production)

Examples:
  scripts/refresh_dev_key.sh
  RAILWAY_ENVIRONMENT=staging scripts/refresh_dev_key.sh --service farsight
EOF
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

update_local_env() {
  local new_key="$1"
  local temp_file

  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Expected env file at $ENV_FILE" >&2
    exit 1
  fi

  temp_file="$(mktemp)"
  if grep -q '^RIOT_API_KEY=' "$ENV_FILE"; then
    sed "s/^RIOT_API_KEY=.*/RIOT_API_KEY=${new_key}/" "$ENV_FILE" >"$temp_file"
  else
    cat "$ENV_FILE" >"$temp_file"
    printf '\nRIOT_API_KEY=%s\n' "$new_key" >>"$temp_file"
  fi

  mv "$temp_file" "$ENV_FILE"
}

set_railway_variable() {
  local service_name="$1"
  local new_key="$2"

  printf '%s' "$new_key" | railway variable set RIOT_API_KEY \
    --stdin \
    --service "$service_name" \
    --environment "$RAILWAY_ENVIRONMENT"
}

restart_service() {
  local service_name="$1"

  railway restart \
    --service "$service_name" \
    --environment "$RAILWAY_ENVIRONMENT" \
    --yes
}

main() {
  local -a services=()
  local new_key

  require_command railway

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --service)
        shift
        if [[ $# -eq 0 ]]; then
          echo "--service requires a value" >&2
          exit 1
        fi
        services+=("$1")
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        echo "Unknown argument: $1" >&2
        usage >&2
        exit 1
        ;;
    esac
    shift
  done

  if [[ ${#services[@]} -eq 0 ]]; then
    read -r -a services <<<"$RAILWAY_SERVICES_DEFAULT"
  fi

  read -rsp "Paste the new Riot dev key: " new_key
  echo

  if [[ ! "$new_key" =~ ^RGAPI- ]]; then
    echo "The key does not look like a Riot API key (expected it to start with RGAPI-)." >&2
    exit 1
  fi

  update_local_env "$new_key"
  echo "Updated ${ENV_FILE}"

  for service_name in "${services[@]}"; do
    echo "Updating Railway variable for ${service_name} (${RAILWAY_ENVIRONMENT})..."
    set_railway_variable "$service_name" "$new_key"
    echo "Restarting ${service_name}..."
    restart_service "$service_name"
  done

  echo "Riot dev key refresh complete."
}

main "$@"

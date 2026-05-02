#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://farsight-production.up.railway.app}}"
REQUESTS="${REQUESTS:-10}"

if [[ -z "${PUUID:-}" ]]; then
  echo "Set PUUID to audit summoner-specific endpoints, for example:" >&2
  echo "  PUUID=your-puuid bash scripts/perf_audit.sh" >&2
  exit 1
fi

measure_endpoint() {
  local label="$1"
  local path="$2"
  local -a samples=()
  local i

  echo
  echo "== ${label} =="

  for ((i = 1; i <= REQUESTS; i++)); do
    local sample
    sample="$(curl -w '%{time_total}\n' -o /dev/null -s "${BASE_URL}${path}")"
    samples+=("$sample")
    printf '  run %02d: %s s\n' "$i" "$sample"
  done

  printf '%s\n' "${samples[@]}" | sort -n >/tmp/perf_audit_samples.txt
  local p95_index
  p95_index=$(( (REQUESTS * 95 + 99) / 100 ))
  if (( p95_index < 1 )); then
    p95_index=1
  elif (( p95_index > REQUESTS )); then
    p95_index=REQUESTS
  fi

  local p95_value
  p95_value="$(sed -n "${p95_index}p" /tmp/perf_audit_samples.txt)"
  echo "  p95: ${p95_value} s"
}

measure_endpoint "health" "/api/v1/health"
measure_endpoint "summoner profile" "/api/v1/summoners/${PUUID}"
measure_endpoint "ranked summary" "/api/v1/summoners/${PUUID}/ranked-summary"
measure_endpoint "matches" "/api/v1/summoners/${PUUID}/matches?limit=20&offset=0"
measure_endpoint "gold curves" "/api/v1/summoners/${PUUID}/gold-curves"
measure_endpoint "champion stats" "/api/v1/summoners/${PUUID}/champion-stats"

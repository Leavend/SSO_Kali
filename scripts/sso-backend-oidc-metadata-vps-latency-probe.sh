#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-https://api-sso.timeh.my.id}"
SAMPLES="${SAMPLES:-120}"
PARALLEL="${PARALLEL:-20}"
P95_TARGET_MS="${P95_TARGET_MS:-300}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

paths=(
  "/.well-known/openid-configuration"
  "/.well-known/jwks.json"
  "/jwks"
)

log() {
  printf '[sso-oidc-latency] %s\n' "$*"
}

measure_path() {
  local path="$1"
  local safe_name
  safe_name="$(printf '%s' "$path" | tr '/.' '__')"
  local output_file="$TMP_DIR/${safe_name}.jsonl"

  log "measuring path=${path} samples=${SAMPLES} parallel=${PARALLEL}"

  seq 1 "$SAMPLES" | xargs -P "$PARALLEL" -I{} sh -c '
    curl -fsS -o /dev/null \
      -H "Accept: application/json" \
      -w "{\"status\":%{http_code},\"time_total_ms\":%{time_total}000}\n" \
      "$1"
  ' sh "${BASE_URL}${path}" > "$output_file"

  python3 - "$path" "$output_file" "$P95_TARGET_MS" <<'PY'
from __future__ import annotations

import json
import math
import statistics
import sys

path = sys.argv[1]
filename = sys.argv[2]
target = float(sys.argv[3])

values: list[float] = []
statuses: dict[int, int] = {}

with open(filename, 'r', encoding='utf-8') as handle:
    for line in handle:
        if not line.strip():
            continue
        sample = json.loads(line)
        status = int(sample['status'])
        statuses[status] = statuses.get(status, 0) + 1
        values.append(float(sample['time_total_ms']))

if not values:
    raise SystemExit(f'{path}: no samples collected')

values.sort()
index = max(0, math.ceil(0.95 * len(values)) - 1)
p95 = values[index]
p90 = values[max(0, math.ceil(0.90 * len(values)) - 1)]
p99 = values[max(0, math.ceil(0.99 * len(values)) - 1)]
avg = statistics.fmean(values)
median = statistics.median(values)
status = 'PASS' if p95 < target and statuses.get(200, 0) == len(values) else 'WARN'

print(
    f'{path} status={status} count={len(values)} statuses={statuses} '
    f'avg={avg:.2f}ms median={median:.2f}ms p90={p90:.2f}ms '
    f'p95={p95:.2f}ms p99={p99:.2f}ms max={values[-1]:.2f}ms target_p95<{target:.0f}ms'
)
PY
}

log "base=${BASE_URL} samples=${SAMPLES} parallel=${PARALLEL} target_p95_ms=${P95_TARGET_MS}"
for path in "${paths[@]}"; do
  measure_path "$path"
done

log 'final headers'
for path in "${paths[@]}"; do
  printf -- '--- %s\n' "$path"
  curl -fsS -D - -o /dev/null -H 'Accept: application/json' "${BASE_URL}${path}" \
    | awk 'BEGIN{IGNORECASE=1}/^HTTP\/|^cache-control:|^x-edge-cache:|^x-request-id:/{print}'
done

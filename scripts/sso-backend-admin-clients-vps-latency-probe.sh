#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-https://api-sso.timeh.my.id}"
SAMPLES="${SAMPLES:-120}"
PARALLEL="${PARALLEL:-20}"
P95_TARGET_MS="${P95_TARGET_MS:-500}"
EXPECTED_STATUSES="${EXPECTED_STATUSES:-401 405 429}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Format: METHOD PATH
routes=(
  "GET /admin/api/clients"
  "POST /admin/api/clients"
  "GET /admin/api/clients/c1"
  "PUT /admin/api/clients/c1"
  "DELETE /admin/api/clients/c1"
  "PUT /admin/api/clients/c1/scopes"
)

log() {
  printf '[sso-admin-clients-latency] %s\n' "$*"
}

measure_route() {
  local method="$1"
  local path="$2"
  local safe_name
  safe_name="$(printf '%s_%s' "$method" "$path" | tr '/.' '__')"
  local output_file="$TMP_DIR/${safe_name}.jsonl"

  log "measuring method=${method} path=${path} samples=${SAMPLES} parallel=${PARALLEL}"

  seq 1 "$SAMPLES" | xargs -P "$PARALLEL" -I{} sh -c '
    curl -sS -o /dev/null \
      -H "Accept: application/json" \
      -H "Content-Type: application/json" \
      -X "$1" \
      -w "{\"status\":%{http_code},\"time_total_ms\":%{time_total}000}\n" \
      "$2"
  ' sh "$method" "${BASE_URL}${path}" > "$output_file"

  EXPECTED_STATUSES="$EXPECTED_STATUSES" \
  python3 - "$method $path" "$output_file" "$P95_TARGET_MS" <<'PY'
from __future__ import annotations

import json
import math
import os
import statistics
import sys

label = sys.argv[1]
filename = sys.argv[2]
target = float(sys.argv[3])
expected = {int(s) for s in os.environ['EXPECTED_STATUSES'].split()}

values: list[float] = []
statuses: dict[int, int] = {}

with open(filename, 'r', encoding='utf-8') as handle:
    for line in handle:
        stripped = line.strip()
        if not stripped:
            continue
        sample = json.loads(stripped)
        status = int(sample['status'])
        statuses[status] = statuses.get(status, 0) + 1
        values.append(float(sample['time_total_ms']))

if not values:
    raise SystemExit(f'{label}: no samples collected')

values.sort()
count = len(values)
p95 = values[max(0, math.ceil(0.95 * count) - 1)]
p90 = values[max(0, math.ceil(0.90 * count) - 1)]
p99 = values[max(0, math.ceil(0.99 * count) - 1)]
avg = statistics.fmean(values)
median = statistics.median(values)
unexpected = {s: c for s, c in statuses.items() if s not in expected}
status_result = 'PASS' if p95 < target and not unexpected else 'WARN'

print(
    f'{label} status={status_result} count={count} statuses={statuses} '
    f'unexpected={unexpected} avg={avg:.2f}ms median={median:.2f}ms p90={p90:.2f}ms '
    f'p95={p95:.2f}ms p99={p99:.2f}ms max={values[-1]:.2f}ms target_p95<{target:.0f}ms'
)
PY
}

log "base=${BASE_URL} samples=${SAMPLES} parallel=${PARALLEL} target_p95_ms=${P95_TARGET_MS} expected=${EXPECTED_STATUSES}"
for route in "${routes[@]}"; do
  method="${route%% *}"
  path="${route#* }"
  measure_route "$method" "$path"
done

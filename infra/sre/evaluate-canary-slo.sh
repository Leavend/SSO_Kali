#!/usr/bin/env bash
set -euo pipefail

CANARY_SUCCESS_RATE="${CANARY_SUCCESS_RATE:-100}"
CANARY_5XX_RATE="${CANARY_5XX_RATE:-0}"
CANARY_P95_MS="${CANARY_P95_MS:-0}"
CANARY_JWKS_REFRESH_FAIL_RATE="${CANARY_JWKS_REFRESH_FAIL_RATE:-0}"

MIN_SUCCESS_RATE="${MIN_SUCCESS_RATE:-99.5}"
MAX_5XX_RATE="${MAX_5XX_RATE:-1.0}"
MAX_P95_MS="${MAX_P95_MS:-750}"
MAX_JWKS_REFRESH_FAIL_RATE="${MAX_JWKS_REFRESH_FAIL_RATE:-0.1}"

compare_gt() {
  python3 - <<'PY' "$1" "$2"
from decimal import Decimal
import sys

left = Decimal(sys.argv[1])
right = Decimal(sys.argv[2])
print("true" if left > right else "false")
PY
}

compare_lt() {
  python3 - <<'PY' "$1" "$2"
from decimal import Decimal
import sys

left = Decimal(sys.argv[1])
right = Decimal(sys.argv[2])
print("true" if left < right else "false")
PY
}

main() {
  if [[ "$(compare_lt "$CANARY_SUCCESS_RATE" "$MIN_SUCCESS_RATE")" == "true" ]]; then
    printf '[evaluate-canary-slo][ERROR] success rate breach: actual=%s threshold=%s\n' "$CANARY_SUCCESS_RATE" "$MIN_SUCCESS_RATE" >&2
    exit 1
  fi

  if [[ "$(compare_gt "$CANARY_5XX_RATE" "$MAX_5XX_RATE")" == "true" ]]; then
    printf '[evaluate-canary-slo][ERROR] 5xx breach: actual=%s threshold=%s\n' "$CANARY_5XX_RATE" "$MAX_5XX_RATE" >&2
    exit 1
  fi

  if [[ "$(compare_gt "$CANARY_P95_MS" "$MAX_P95_MS")" == "true" ]]; then
    printf '[evaluate-canary-slo][ERROR] p95 latency breach: actual=%s threshold=%s\n' "$CANARY_P95_MS" "$MAX_P95_MS" >&2
    exit 1
  fi

  if [[ "$(compare_gt "$CANARY_JWKS_REFRESH_FAIL_RATE" "$MAX_JWKS_REFRESH_FAIL_RATE")" == "true" ]]; then
    printf '[evaluate-canary-slo][ERROR] jwks refresh failure breach: actual=%s threshold=%s\n' "$CANARY_JWKS_REFRESH_FAIL_RATE" "$MAX_JWKS_REFRESH_FAIL_RATE" >&2
    exit 1
  fi

  printf '[evaluate-canary-slo] OK\n'
}

main

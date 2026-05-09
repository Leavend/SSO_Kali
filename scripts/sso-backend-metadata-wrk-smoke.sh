#!/usr/bin/env bash

set -Eeuo pipefail

PUBLIC_BASE_URL="${SSO_PUBLIC_BASE_URL:-https://api-sso.timeh.my.id}"
THREADS="${WRK_THREADS:-8}"
CONNECTIONS="${WRK_CONNECTIONS:-500}"
DURATION="${WRK_DURATION:-2m}"
RESULT_DIR="${WRK_RESULT_DIR:-wrk-results/sso-backend-metadata}"

log() {
  printf '[sso-backend-metadata-wrk-smoke] %s\n' "$*"
}

fail() {
  printf '[sso-backend-metadata-wrk-smoke][FAIL] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/sso-backend-metadata-wrk-smoke.sh [options]

Options:
  --public-base-url URL  Public backend URL. Default: https://api-sso.timeh.my.id
  --threads N            wrk threads. Default: 8
  --connections N        wrk connections. Default: 500
  --duration DURATION    wrk duration. Default: 2m
  --result-dir DIR       Directory for evidence files. Default: wrk-results/sso-backend-metadata
  -h, --help             Show help

Environment alternatives:
  SSO_PUBLIC_BASE_URL, WRK_THREADS, WRK_CONNECTIONS, WRK_DURATION, WRK_RESULT_DIR
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public-base-url) PUBLIC_BASE_URL="${2:-}"; shift 2 ;;
    --threads) THREADS="${2:-8}"; shift 2 ;;
    --connections) CONNECTIONS="${2:-500}"; shift 2 ;;
    --duration) DURATION="${2:-2m}"; shift 2 ;;
    --result-dir) RESULT_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"
[[ "$PUBLIC_BASE_URL" == https://* ]] || fail 'public backend URL must use HTTPS'
[[ -n "$RESULT_DIR" ]] || fail 'result directory is required'

WRK_BIN="$(command -v wrk || true)"
if [[ -z "$WRK_BIN" && -x /opt/homebrew/bin/wrk ]]; then
  WRK_BIN="/opt/homebrew/bin/wrk"
fi
if [[ -z "$WRK_BIN" && -x /usr/local/bin/wrk ]]; then
  WRK_BIN="/usr/local/bin/wrk"
fi
[[ -n "$WRK_BIN" ]] || fail 'wrk binary not found. Install with: brew install wrk'

mkdir -p "$RESULT_DIR"

run_wrk() {
  local name="$1" path="$2" output_file="$RESULT_DIR/${name}.txt"

  {
    printf 'endpoint=%s\n' "$path"
    printf 'url=%s%s\n' "$PUBLIC_BASE_URL" "$path"
    printf 'threads=%s\n' "$THREADS"
    printf 'connections=%s\n' "$CONNECTIONS"
    printf 'duration=%s\n' "$DURATION"
    printf 'timestamp=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    printf '\n'
    "$WRK_BIN" -t"$THREADS" -c"$CONNECTIONS" -d"$DURATION" --latency "$PUBLIC_BASE_URL$path"
  } | tee "$output_file"

  log "evidence written: $output_file"
}

run_wrk 'jwks-alias' '/jwks'
run_wrk 'jwks-well-known' '/.well-known/jwks.json'
run_wrk 'openid-configuration' '/.well-known/openid-configuration'

log 'Metadata/JWKS WRK smoke completed. Review p99 latency, socket errors, timeouts, and Requests/sec.'

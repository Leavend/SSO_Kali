#!/usr/bin/env bash

set -Eeuo pipefail

HOST=""
USER_NAME=""
PORT="22"
PROJECT_DIR="/opt/sso-kali"
ENV_FILE=""
COMPOSE_FILE=""
SERVICE="sso-backend"
START_SERVICES="false"
TAIL_LINES="160"
PUBLIC_BASE_URL=""

log() {
  printf '[sso-backend-vps-smoke] %s\n' "$*"
}

warn() {
  printf '[sso-backend-vps-smoke][WARN] %s\n' "$*" >&2
}

die() {
  printf '[sso-backend-vps-smoke][ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/sso-backend-vps-smoke.sh --host HOST --user USER [options]

Options:
  --host HOST             VPS host or SSH alias.
  --user USER             SSH user.
  --port PORT             SSH port. Default: 22.
  --project-dir DIR       Remote project dir. Default: /opt/sso-kali.
  --env-file FILE         Remote env file. Default: <project-dir>/.env.prod.
  --compose-file FILE     Remote compose file. Default: <project-dir>/docker-compose.main.yml.
  --start-services        Pull and start postgres, redis, and sso-backend before smoke.
  --public-base-url URL   Optional public base URL to smoke after internal checks.
  --tail-lines N          Log lines printed on failure. Default: 160.
  -h, --help              Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host) HOST="${2:-}"; shift 2 ;;
    --user) USER_NAME="${2:-}"; shift 2 ;;
    --port) PORT="${2:-22}"; shift 2 ;;
    --project-dir) PROJECT_DIR="${2:-}"; shift 2 ;;
    --env-file) ENV_FILE="${2:-}"; shift 2 ;;
    --compose-file) COMPOSE_FILE="${2:-}"; shift 2 ;;
    --start-services) START_SERVICES="true"; shift ;;
    --public-base-url) PUBLIC_BASE_URL="${2:-}"; shift 2 ;;
    --tail-lines) TAIL_LINES="${2:-160}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "$HOST" ]] || die 'Missing --host'
[[ -n "$USER_NAME" ]] || die 'Missing --user'
[[ -n "$PROJECT_DIR" ]] || die 'Missing --project-dir'

ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.main.yml}"

SSH_TARGET="$USER_NAME@$HOST"
SSH_OPTS=(
  -p "$PORT"
  -o BatchMode=yes
  -o ConnectTimeout=20
  -o ServerAliveInterval=10
  -o ServerAliveCountMax=3
)

REMOTE_SCRIPT=$(cat <<'REMOTE'
set -Eeuo pipefail

log() { printf '[remote-sso-backend-smoke] %s\n' "$*"; }
die() { printf '[remote-sso-backend-smoke][ERROR] %s\n' "$*" >&2; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

smoke_url() {
  local label="$1" url="$2" expected="${3:-200}" code
  code="$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || true)"
  if [[ ! "$code" =~ $expected ]]; then
    log "Container status:"
    compose ps || true
    local container_id
    container_id="$(compose ps -q "$SERVICE" 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      docker logs --tail "$TAIL_LINES" "$container_id" >&2 || true
    fi
    die "$label failed: $url returned ${code:-000}"
  fi
  log "$label OK ($code): $url"
}

command -v docker >/dev/null 2>&1 || die 'docker missing'
command -v curl >/dev/null 2>&1 || die 'curl missing'
docker compose version >/dev/null 2>&1 || die 'docker compose plugin missing'
[[ -d "$PROJECT_DIR" ]] || die "project dir missing: $PROJECT_DIR"
[[ -f "$COMPOSE_FILE" ]] || die "compose file missing: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "env file missing: $ENV_FILE"

cd "$PROJECT_DIR"
compose config >/dev/null

if [[ "$START_SERVICES" == "true" ]]; then
  compose pull postgres redis "$SERVICE" || compose pull "$SERVICE"
  compose up -d postgres redis
  compose up -d "$SERVICE"
fi

container_id="$(compose ps -q "$SERVICE" 2>/dev/null || true)"
[[ -n "$container_id" ]] || die "$SERVICE container is not running or not created"

port="$(compose port "$SERVICE" 8000 2>/dev/null | sed -E 's/.*:([0-9]+)$/\1/' | tail -n 1)"
if [[ -z "$port" ]]; then
  port="8200"
fi
base="http://127.0.0.1:${port}"

smoke_url '/up' "$base/up" '^(200)$'
smoke_url '/health' "$base/health" '^(200)$'
smoke_url 'discovery' "$base/.well-known/openid-configuration" '^(200)$'
smoke_url 'jwks' "$base/.well-known/jwks.json" '^(200)$'

if [[ -n "${PUBLIC_BASE_URL:-}" ]]; then
  public_base="${PUBLIC_BASE_URL%/}"
  smoke_url 'public /up' "$public_base/up" '^(200)$'
  smoke_url 'public /health' "$public_base/health" '^(200)$'
  smoke_url 'public discovery' "$public_base/.well-known/openid-configuration" '^(200)$'
  smoke_url 'public jwks' "$public_base/.well-known/jwks.json" '^(200)$'
fi

compose ps
log 'SSO backend VPS smoke completed successfully'
REMOTE
)

log "Running smoke test on $SSH_TARGET:$PORT ($PROJECT_DIR)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
  PROJECT_DIR="$PROJECT_DIR" \
  ENV_FILE="$ENV_FILE" \
  COMPOSE_FILE="$COMPOSE_FILE" \
  SERVICE="$SERVICE" \
  START_SERVICES="$START_SERVICES" \
  TAIL_LINES="$TAIL_LINES" \
  PUBLIC_BASE_URL="$PUBLIC_BASE_URL" \
  "bash -s" <<< "$REMOTE_SCRIPT"

#!/usr/bin/env bash

set -Eeuo pipefail

HOST=""
USER_NAME=""
PORT="22"
PROJECT_DIR="/opt/sso-backend-prod"
ENV_FILE=""
COMPOSE_FILE=""
SERVICE="sso-backend"
START_SERVICES="false"
TAIL_LINES="160"
PUBLIC_BASE_URL=""
SSH_IDENTITY_FILE=""
EXPECTED_SERVICES="postgres redis sso-backend sso-backend-worker"
FORBIDDEN_SERVICES="sso-admin-vue"

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
  --project-dir DIR       Remote project dir. Default: /opt/sso-backend-prod.
  --env-file FILE         Remote env file. Default: <project-dir>/.env.prod.
  --compose-file FILE     Remote compose file. Default: <project-dir>/docker-compose.main.yml.
  --start-services        Pull and start postgres, redis, and sso-backend before smoke.
  --public-base-url URL   Optional public base URL to smoke after internal checks.
  --ssh-identity-file FILE Optional SSH private key file for remote smoke.
  --tail-lines N          Log lines printed on failure. Default: 160.
  --expected-services CSV Expected compose services. Default: postgres,redis,sso-backend,sso-backend-worker.
  --forbidden-services CSV Forbidden compose services. Default: sso-admin-vue.
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
    --ssh-identity-file) SSH_IDENTITY_FILE="${2:-}"; shift 2 ;;
    --tail-lines) TAIL_LINES="${2:-160}"; shift 2 ;;
    --expected-services) EXPECTED_SERVICES="${2//,/ }"; shift 2 ;;
    --forbidden-services) FORBIDDEN_SERVICES="${2//,/ }"; shift 2 ;;
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
if [[ -n "$SSH_IDENTITY_FILE" ]]; then
  SSH_OPTS=(-i "$SSH_IDENTITY_FILE" "${SSH_OPTS[@]}")
fi

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

smoke_cors_preflight() {
  local base_url="$1" origin="$2" headers status allow_origin allow_credentials
  [[ -n "$base_url" && -n "$origin" ]] || die 'CORS smoke requires base URL and origin'

  headers="$(mktemp)"
  status="$(curl -ksS -o /dev/null -D "$headers" -w '%{http_code}' --max-time 20 \
    -X OPTIONS "${base_url%/}/api/auth/login" \
    -H "Origin: $origin" \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: content-type,x-request-id' || true)"

  allow_origin="$(awk 'BEGIN{IGNORECASE=1} /^access-control-allow-origin:/ {sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "$headers")"
  allow_credentials="$(awk 'BEGIN{IGNORECASE=1} /^access-control-allow-credentials:/ {sub(/^[^:]+:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit}' "$headers")"
  rm -f "$headers"

  [[ "$status" =~ ^(200|204)$ ]] || die "CORS preflight failed: ${base_url%/}/api/auth/login returned ${status:-000}"
  [[ "$allow_origin" == "$origin" ]] || die "CORS preflight returned invalid Access-Control-Allow-Origin '$allow_origin' (expected '$origin')"
  [[ "$allow_credentials" == "true" ]] || die "CORS preflight returned invalid Access-Control-Allow-Credentials '$allow_credentials'"

  log "CORS preflight OK (${status}): ${base_url%/}/api/auth/login allows $origin"
}

verify_topology() {
  local service

  for service in $EXPECTED_SERVICES; do
    if ! compose ps -q "$service" >/dev/null 2>&1 || [[ -z "$(compose ps -q "$service" 2>/dev/null || true)" ]]; then
      compose ps >&2 || true
      die "expected service missing: $service"
    fi
    log "expected service present: $service"
  done

  for service in $FORBIDDEN_SERVICES; do
    if compose ps -a --format '{{.Service}}' | grep -Fxq "$service"; then
      compose ps -a >&2 || true
      die "forbidden service still present: $service"
    fi
    log "forbidden service absent: $service"
  done
}

verify_worker_logs() {
  local worker_id
  worker_id="$(compose ps -q sso-backend-worker 2>/dev/null || true)"
  [[ -n "$worker_id" ]] || die 'sso-backend-worker container is not running or not created'

  if docker logs --tail "$TAIL_LINES" "$worker_id" 2>&1 | grep -Eiq '(fatal error|uncaught|exception|segmentation fault|could not open input file)'; then
    docker logs --tail "$TAIL_LINES" "$worker_id" >&2 || true
    die 'sso-backend-worker logs contain immediate failure markers'
  fi

  log 'sso-backend-worker logs do not contain immediate failure markers'
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

cors_origin="$(grep -E '^SSO_FRONTEND_URL=' "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\"' || true)"
cors_origin="${cors_origin:-https://sso.timeh.my.id}"
smoke_cors_preflight "$base" "$cors_origin"

if [[ -n "${PUBLIC_BASE_URL:-}" ]]; then
  public_base="${PUBLIC_BASE_URL%/}"
  smoke_url 'public /up' "$public_base/up" '^(200)$'
  smoke_url 'public /health' "$public_base/health" '^(200)$'
  smoke_url 'public discovery' "$public_base/.well-known/openid-configuration" '^(200)$'
  smoke_url 'public jwks' "$public_base/.well-known/jwks.json" '^(200)$'
  smoke_cors_preflight "$public_base" "$cors_origin"
fi

verify_topology
verify_worker_logs

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
  EXPECTED_SERVICES="$EXPECTED_SERVICES" \
  FORBIDDEN_SERVICES="$FORBIDDEN_SERVICES" \
  "bash -s" <<< "$REMOTE_SCRIPT"

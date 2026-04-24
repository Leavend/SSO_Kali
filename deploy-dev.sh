#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
PRECHECK_ONLY=0
SKIP_BUILD=0
SKIP_MIGRATIONS=0

log() {
  printf '[deploy-dev] %s\n' "$*"
}

warn() {
  printf '[deploy-dev][WARN] %s\n' "$*" >&2
}

die() {
  printf '[deploy-dev][ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./deploy-dev.sh [options]

Options:
  --preflight-only    Validate environment and compose config only.
  --skip-build        Reuse previously built application images.
  --skip-migrations   Skip one-off Laravel database migrations.
  -h, --help          Show this help text.
EOF
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

check_required_files() {
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"
  [[ -f "$ROOT_DIR/.secrets/oidc/private.pem" ]] || die "Missing OIDC private key: $ROOT_DIR/.secrets/oidc/private.pem"
  [[ -f "$ROOT_DIR/.secrets/oidc/public.pem" ]] || die "Missing OIDC public key: $ROOT_DIR/.secrets/oidc/public.pem"
}

check_placeholders() {
  local placeholder_lines
  placeholder_lines="$(grep -En '^[A-Z0-9_]+=((REPLACE_WITH_|REPLACE_AFTER_|__PENDING_).*)$' "$ENV_FILE" || true)"
  if [[ -n "$placeholder_lines" ]]; then
    warn "Environment still contains placeholder values:"
    printf '%s\n' "$placeholder_lines" >&2
  fi
}

check_port_availability() {
  local current_proxy_id listener
  current_proxy_id="$(compose ps -q proxy 2>/dev/null || true)"
  listener="$(ss -ltnp "( sport = :${PROXY_HTTP_PUBLISHED_PORT} )" | tail -n +2 || true)"

  if [[ -n "$listener" && -z "$current_proxy_id" ]]; then
    printf '%s\n' "$listener" >&2
    die "Port ${PROXY_HTTP_PUBLISHED_PORT} is already in use by another process"
  fi
}

run_compose_validation() {
  compose config >/dev/null
}

build_images() {
  if [[ "$SKIP_BUILD" -eq 1 ]]; then
    log "Skipping image build as requested"
    return
  fi

  log "Pulling upstream images"
  compose pull proxy postgres redis

  log "Building application images"
  compose build --pull zitadel-api sso-backend sso-frontend sso-admin-vue app-a-next app-b-laravel
}

wait_for_service() {
  local service="$1"
  local timeout="${2:-180}"
  local elapsed=0
  local container_id status

  while (( elapsed < timeout )); do
    container_id="$(compose ps -q "$service" 2>/dev/null || true)"

    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"

      case "$status" in
        healthy|running)
          log "Service '$service' is $status"
          return 0
          ;;
        unhealthy|exited|dead)
          docker logs --tail 120 "$container_id" >&2 || true
          die "Service '$service' entered unhealthy state ($status)"
          ;;
      esac
    fi

    sleep 5
    elapsed=$((elapsed + 5))
  done

  die "Timed out waiting for service '$service'"
}

run_laravel_migrations() {
  if [[ "$SKIP_MIGRATIONS" -eq 1 ]]; then
    log "Skipping one-off Laravel migrations as requested"
    return
  fi

  log "Running sso-backend migrations"
  compose run --rm --no-deps sso-backend sh -lc \
    'mkdir -p storage/app/oidc storage/framework/cache storage/framework/sessions storage/framework/views storage/logs && php artisan migrate --force'

  log "Running app-b-laravel migrations"
  compose run --rm --no-deps app-b-laravel sh -lc \
    'mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs && php artisan migrate --force'
}

check_route() {
  local host="$1"
  local path="$2"
  local code

  code="$(curl -sS -o /dev/null -w '%{http_code}' -H "Host: $host" "http://${PROXY_HTTP_BIND_IP}:${PROXY_HTTP_PUBLISHED_PORT}${path}" || true)"
  if [[ "$code" =~ ^2|3 ]]; then
    log "Route check OK for ${host}${path} (HTTP $code)"
    return 0
  fi

  warn "Route check failed for ${host}${path} (HTTP ${code:-000})"
  return 1
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --preflight-only)
        PRECHECK_ONLY=1
        ;;
      --skip-build)
        SKIP_BUILD=1
        ;;
      --skip-migrations)
        SKIP_MIGRATIONS=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
    shift
  done

  require_command docker
  require_command curl
  require_command ss
  check_required_files

  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is not available"

  PROXY_HTTP_BIND_IP="$(get_env PROXY_HTTP_BIND_IP)"
  PROXY_HTTP_PUBLISHED_PORT="$(get_env PROXY_HTTP_PUBLISHED_PORT)"
  SSO_DOMAIN="$(get_env SSO_DOMAIN)"
  ZITADEL_DOMAIN="$(get_env ZITADEL_DOMAIN)"
  APP_A_DOMAIN="$(get_env APP_A_DOMAIN)"
  APP_B_DOMAIN="$(get_env APP_B_DOMAIN)"

  [[ -n "$PROXY_HTTP_BIND_IP" ]] || die "Missing PROXY_HTTP_BIND_IP in $ENV_FILE"
  [[ -n "$PROXY_HTTP_PUBLISHED_PORT" ]] || die "Missing PROXY_HTTP_PUBLISHED_PORT in $ENV_FILE"
  [[ -n "$SSO_DOMAIN" ]] || die "Missing SSO_DOMAIN in $ENV_FILE"
  [[ -n "$ZITADEL_DOMAIN" ]] || die "Missing ZITADEL_DOMAIN in $ENV_FILE"
  [[ -n "$APP_A_DOMAIN" ]] || die "Missing APP_A_DOMAIN in $ENV_FILE"
  [[ -n "$APP_B_DOMAIN" ]] || die "Missing APP_B_DOMAIN in $ENV_FILE"

  log "Running preflight checks"
  check_placeholders
  check_port_availability
  run_compose_validation

  if [[ "$PRECHECK_ONLY" -eq 1 ]]; then
    log "Preflight completed"
    exit 0
  fi

  build_images

  log "Starting stateful dependencies"
  compose up -d postgres redis
  wait_for_service postgres 180
  wait_for_service redis 120

  log "Starting ZITADEL services"
  compose up -d zitadel-api
  wait_for_service zitadel-api 240

  run_laravel_migrations

  log "Starting application services and proxy"
  compose up -d --remove-orphans sso-backend sso-frontend sso-admin-vue app-a-next app-b-laravel proxy
  wait_for_service sso-backend 240
  wait_for_service sso-frontend 240
  wait_for_service sso-admin-vue 180
  wait_for_service app-a-next 240
  wait_for_service app-b-laravel 240
  wait_for_service proxy 120

  log "Running smoke checks through loopback proxy"
  check_route "$SSO_DOMAIN" "/.well-known/openid-configuration"
  check_route "$ZITADEL_DOMAIN" "/.well-known/openid-configuration"
  check_route "$APP_A_DOMAIN" "/"
  check_route "$APP_B_DOMAIN" "/"

  log "Deployment summary"
  compose ps

  if grep -Eq '^ZITADEL_BROKER_CLIENT_SECRET=__PENDING_' "$ENV_FILE"; then
    warn "ZITADEL broker client secret is still pending. Stack is running, but upstream brokered login is not production-ready yet."
  fi
}

main "$@"

#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
MODE="full"
PRECHECK_ONLY=0
SKIP_BUILD=0

log() {
  printf '[deploy-remote] %s\n' "$*"
}

warn() {
  printf '[deploy-remote][WARN] %s\n' "$*" >&2
}

die() {
  printf '[deploy-remote][ERROR] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./deploy-remote.sh [options]

Options:
  --mode <full|backend-only|frontend-only|admin-vue-only|queue-only>
  --preflight-only
  --skip-build
  -h, --help
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --mode) MODE="${2:-}"; shift ;;
      --preflight-only) PRECHECK_ONLY=1 ;;
      --skip-build) SKIP_BUILD=1 ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown option: $1" ;;
    esac
    shift
  done
}

validate_mode() {
  case "$MODE" in
    full|backend-only|frontend-only|admin-vue-only|queue-only) ;;
    *) die "Unsupported mode: $MODE" ;;
  esac
}

require_commands() {
  command -v docker >/dev/null 2>&1 || die "Missing required command: docker"
  command -v curl >/dev/null 2>&1 || die "Missing required command: curl"
  docker compose version >/dev/null 2>&1 || die "Docker Compose plugin is not available"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

get_env() {
  awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

check_required_files() {
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"
  [[ -f "$ROOT_DIR/deploy-dev.sh" ]] || die "Missing deploy-dev.sh"
}

run_compose_validation() {
  compose config >/dev/null
}

service_id() {
  compose ps -q "$1" 2>/dev/null || true
}

service_status() {
  local container_id
  container_id="$(service_id "$1")"
  [[ -n "$container_id" ]] || { printf 'missing'; return 0; }
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "$container_id" 2>/dev/null || true
}

wait_for_service() {
  local service="$1" timeout="${2:-180}" elapsed=0 status
  while (( elapsed < timeout )); do
    status="$(service_status "$service")"
    case "$status" in
      healthy|running) log "Service '$service' is $status"; return 0 ;;
      unhealthy|exited|dead)
        docker logs --tail 120 "$(service_id "$service")" >&2 || true
        die "Service '$service' entered unhealthy state ($status)"
        ;;
    esac
    sleep 5
    elapsed=$((elapsed + 5))
  done
  die "Timed out waiting for service '$service'"
}

ensure_core_dependencies() {
  compose up -d postgres redis zitadel-api proxy
  wait_for_service postgres 180
  wait_for_service redis 120
  wait_for_service zitadel-api 240
  wait_for_service proxy 120
}

build_mode_images() {
  (( SKIP_BUILD )) && { log "Skipping image build"; return; }
  case "$MODE" in
    full) compose build --pull zitadel-login sso-backend sso-backend-worker sso-frontend sso-admin-vue app-a-next app-b-laravel ;;
    backend-only) compose build sso-backend sso-backend-worker ;;
    frontend-only) compose build sso-frontend ;;
    admin-vue-only) compose build sso-admin-vue ;;
    queue-only) compose build sso-backend-worker ;;
  esac
}

run_backend_tasks() {
  compose exec -T sso-backend php artisan migrate --force
  compose exec -T sso-backend php artisan optimize:clear
  compose exec -T sso-backend php artisan config:cache
  compose exec -T sso-backend php artisan route:cache
  compose exec -T sso-backend php artisan view:cache
}

bring_up_backend_stack() {
  compose up -d --no-deps sso-backend sso-backend-worker
  wait_for_service sso-backend 240
  wait_for_service sso-backend-worker 120
  run_backend_tasks
}

bring_up_frontend() {
  compose up -d --no-deps sso-frontend
  wait_for_service sso-frontend 240
}

bring_up_admin_vue() {
  compose up -d --no-deps sso-admin-vue
  wait_for_service sso-admin-vue 180
}

bring_up_queue_worker() {
  compose up -d --no-deps sso-backend-worker
  wait_for_service sso-backend-worker 120
}

run_full_mode() {
  local args=()
  (( SKIP_BUILD )) && args+=(--skip-build)
  bash "$ROOT_DIR/deploy-dev.sh" "${args[@]}"
  compose up -d --no-deps sso-backend-worker zitadel-login sso-admin-vue
  wait_for_service sso-backend-worker 120
  wait_for_service zitadel-login 180
  wait_for_service sso-admin-vue 180
}

curl_code() {
  curl -ksS -o /dev/null -w '%{http_code}' --max-time 15 "$1" || true
}

assert_http_code() {
  local label="$1" url="$2" pattern="$3" code
  code="$(curl_code "$url")"
  [[ "$code" =~ $pattern ]] || die "$label failed for $url (HTTP ${code:-000})"
  log "$label OK for $url (HTTP $code)"
}

smoke_full() {
  assert_http_code "SSO discovery" "https://$(get_env SSO_DOMAIN)/.well-known/openid-configuration" '^(200)$'
  assert_http_code "ZITADEL discovery" "https://$(get_env ZITADEL_DOMAIN)/.well-known/openid-configuration" '^(200)$'
  assert_http_code "Admin panel" "https://$(get_env SSO_DOMAIN)/" '^(200)$'
  assert_http_code "App A" "https://$(get_env APP_A_DOMAIN)/" '^(200|30[1278])$'
  assert_http_code "App B" "https://$(get_env APP_B_DOMAIN)/" '^(200|30[1278])$'
}

smoke_backend() {
  assert_http_code "SSO discovery" "https://$(get_env SSO_DOMAIN)/.well-known/openid-configuration" '^(200)$'
  assert_http_code "Admin API me" "https://$(get_env SSO_DOMAIN)/admin/api/me" '^(401)$'
  compose exec -T sso-backend php artisan schedule:list | grep -F 'sso:prune-tokens' >/dev/null
  log "Token prune schedule is registered"
}

smoke_frontend() {
  assert_http_code "Admin panel" "https://$(get_env SSO_DOMAIN)/" '^(200)$'
  assert_http_code "Auth login" "https://$(get_env SSO_DOMAIN)/auth/login" '^(307)$'
}

smoke_admin_vue() {
  local base_path
  base_path="$(get_env SSO_ADMIN_VUE_BASE_PATH)"
  base_path="${base_path:-/__vue-preview}"
  assert_http_code "Vue admin canary" "https://$(get_env SSO_DOMAIN)${base_path}/healthz" '^(200)$'
}

smoke_queue() {
  local cmdline
  cmdline="$(compose exec -T sso-backend-worker sh -lc "tr '\0' ' ' </proc/1/cmdline")"
  [[ "$cmdline" == *"queue:work"* ]] || die "Queue worker command line is invalid"
  log "Queue worker command line verified"
}

run_mode() {
  ensure_core_dependencies
  build_mode_images
  case "$MODE" in
    full) run_full_mode ;;
    backend-only) bring_up_backend_stack ;;
    frontend-only) bring_up_frontend ;;
    admin-vue-only) bring_up_admin_vue ;;
    queue-only) bring_up_queue_worker ;;
  esac
}

run_smoke_tests() {
  case "$MODE" in
    full) smoke_full; smoke_admin_vue ;;
    backend-only) smoke_backend ;;
    frontend-only) smoke_frontend ;;
    admin-vue-only) smoke_admin_vue ;;
    queue-only) smoke_queue ;;
  esac
}

main() {
  parse_args "$@"
  validate_mode
  require_commands
  check_required_files
  run_compose_validation
  (( PRECHECK_ONLY )) && { log "Preflight completed"; exit 0; }
  run_mode
  run_smoke_tests
  log "Remote deployment completed"
}

main "$@"

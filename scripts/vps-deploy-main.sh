#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/sso-backend-prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.main.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.prod}"
IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/leavend/sso-kali}"
DEPLOY_TAG="${DEPLOY_TAG:-main}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sso-backend-prod}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-180}"

export COMPOSE_PROJECT_NAME

log() {
  printf '[vps-deploy-main] %s\n' "$*"
}

warn() {
  printf '[vps-deploy-main][WARN] %s\n' "$*" >&2
}

die() {
  printf '[vps-deploy-main][ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_runtime() {
  require_command docker
  require_command curl
  docker compose version >/dev/null 2>&1 || die 'Docker Compose plugin is not available'
  [[ -d "$PROJECT_DIR" ]] || die "Missing project directory: $PROJECT_DIR"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"
  if [[ ! -f "$ENV_FILE" && -f "$PROJECT_DIR/.env.dev" ]]; then
    warn "Missing env file: $ENV_FILE; falling back to $PROJECT_DIR/.env.dev"
    ENV_FILE="$PROJECT_DIR/.env.dev"
  fi
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
}

write_release_env() {
  local release_file="$PROJECT_DIR/.release.env"
  cat > "$release_file" <<EOF
SSO_IMAGE_PREFIX=$IMAGE_PREFIX
SSO_DEPLOY_TAG=$DEPLOY_TAG
SSO_RELEASE_SHA_TAG=$DEPLOY_TAG
SSO_RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  chmod 0640 "$release_file" || true
}

backup_release_metadata() {
  mkdir -p "$PROJECT_DIR/releases"
  if [[ -f "$PROJECT_DIR/.release.env" ]]; then
    cp "$PROJECT_DIR/.release.env" \
      "$PROJECT_DIR/releases/release-before-$(date -u +%Y%m%d_%H%M%S).env"
  fi
}

wait_for_service() {
  local service="$1" timeout="${2:-$HEALTH_TIMEOUT_SECONDS}" elapsed=0 container_id status
  log "Waiting for $service health for up to ${timeout}s"
  while (( elapsed < timeout )); do
    container_id="$(compose ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
      case "$status" in
        healthy|running)
          log "$service is $status"
          return 0
          ;;
        unhealthy|exited|dead)
          docker logs --tail 120 "$container_id" >&2 || true
          die "$service became $status"
          ;;
      esac
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  compose ps >&2 || true
  die "Timed out waiting for $service"
}

run_migrations() {
  if compose config --services | grep -qx 'sso-backend'; then
    log 'Running Laravel migrations'
    compose run --rm --no-deps sso-backend php artisan migrate --force
    log 'Optimizing Laravel caches'
    compose run --rm --no-deps sso-backend sh -lc \
      'php artisan config:cache && php artisan route:cache && if [ -d resources/views ]; then php artisan view:cache; else echo "resources/views not found; skipping view cache"; fi'
  fi
}

smoke_url() {
  local label="$1" url="$2" expected="${3:-200}" code
  [[ -n "$url" ]] || { warn "Skipping $label smoke test because URL is empty"; return 0; }
  code="$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || true)"
  [[ "$code" =~ $expected ]] || die "$label smoke failed: $url returned ${code:-000}"
  log "$label smoke OK ($code): $url"
}

run_smoke_tests() {
  # shellcheck disable=SC1090
  source "$ENV_FILE" || true

  local base_url="${SSO_INTERNAL_BASE_URL:-${SSO_BASE_URL:-${APP_URL:-}}}"
  base_url="${base_url%/}"

  smoke_url 'SSO /up' "$base_url/up" '^(200)$'
  smoke_url 'SSO /health' "$base_url/health" '^(200)$'
  smoke_url 'SSO discovery' "$base_url/.well-known/openid-configuration" '^(200)$'
  smoke_url 'SSO JWKS' "$base_url/.well-known/jwks.json" '^(200)$'

  if compose config --services | grep -qx 'sso-admin-vue'; then
    smoke_url 'SSO admin' "${SSO_ADMIN_URL:-$base_url}" '^(200|30[1278])$'
  fi
}

main() {
  require_runtime
  backup_release_metadata
  write_release_env

  log "Deploying tag '$DEPLOY_TAG' from '$IMAGE_PREFIX' into '$PROJECT_DIR'"

  export SSO_IMAGE_PREFIX="$IMAGE_PREFIX"
  export SSO_DEPLOY_TAG="$DEPLOY_TAG"

  compose config >/dev/null
  compose pull sso-backend sso-admin-vue || compose pull

  compose up -d postgres redis
  wait_for_service postgres 180
  wait_for_service redis 120

  run_migrations

  compose up -d --remove-orphans sso-backend sso-admin-vue
  wait_for_service sso-backend 240
  wait_for_service sso-admin-vue 180

  run_smoke_tests
  compose ps
  log 'Deployment completed successfully'
}

main "$@"

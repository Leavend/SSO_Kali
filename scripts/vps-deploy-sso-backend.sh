#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/sso-backend-prod}"
COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.sso-backend.yml}"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.prod}"
IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/leavend/sso-kali}"
DEPLOY_TAG="${DEPLOY_TAG:-main}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-sso-backend-prod}"
HEALTH_TIMEOUT_SECONDS="${HEALTH_TIMEOUT_SECONDS:-240}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

export COMPOSE_PROJECT_NAME

log() {
  printf '[vps-deploy-sso-backend] %s\n' "$*"
}

warn() {
  printf '[vps-deploy-sso-backend][WARN] %s\n' "$*" >&2
}

die() {
  printf '[vps-deploy-sso-backend][ERROR] %s\n' "$*" >&2
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
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
}

write_release_env() {
  local release_file="$PROJECT_DIR/.release.env"
  cat > "$release_file" <<EOF_RELEASE
SSO_IMAGE_PREFIX=$IMAGE_PREFIX
SSO_DEPLOY_TAG=$DEPLOY_TAG
SSO_RELEASE_SHA_TAG=$DEPLOY_TAG
SSO_RELEASED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF_RELEASE
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
          docker logs --tail 180 "$container_id" >&2 || true
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
  [[ "$RUN_MIGRATIONS" == "true" ]] || { warn 'Skipping migrations because RUN_MIGRATIONS != true'; return 0; }

  log 'Running Laravel migrations'
  compose run --rm --no-deps sso-backend php artisan migrate --force
}

smoke_url() {
  local label="$1" url="$2" expected="${3:-200}" code
  code="$(curl -ksS -o /dev/null -w '%{http_code}' --max-time 20 "$url" || true)"
  [[ "$code" =~ $expected ]] || die "$label smoke failed: $url returned ${code:-000}"
  log "$label smoke OK ($code): $url"
}

backend_base_url() {
  local published
  published="$(compose port sso-backend 8000 2>/dev/null | tail -n 1 || true)"
  if [[ -n "$published" ]]; then
    printf 'http://%s' "$published"
    return 0
  fi

  # shellcheck disable=SC1090
  source "$ENV_FILE" || true
  printf '%s' "${SSO_INTERNAL_SMOKE_URL:-http://127.0.0.1:8200}"
}

run_smoke_tests() {
  local base_url
  base_url="$(backend_base_url)"
  base_url="${base_url%/}"

  smoke_url 'SSO /up' "$base_url/up" '^(200)$'
  smoke_url 'SSO /health' "$base_url/health" '^(200)$'
  smoke_url 'SSO discovery' "$base_url/.well-known/openid-configuration" '^(200)$'
  smoke_url 'SSO JWKS' "$base_url/.well-known/jwks.json" '^(200)$'
}

main() {
  require_runtime
  backup_release_metadata
  write_release_env

  log "Deploying SSO backend tag '$DEPLOY_TAG' from '$IMAGE_PREFIX' into '$PROJECT_DIR'"

  export SSO_IMAGE_PREFIX="$IMAGE_PREFIX"
  export SSO_DEPLOY_TAG="$DEPLOY_TAG"

  compose config >/dev/null
  compose pull postgres redis
  compose pull sso-backend sso-worker || warn 'Backend image pull failed; continuing with a locally available image if present'

  compose up -d postgres redis
  wait_for_service postgres 180
  wait_for_service redis 120

  run_migrations

  compose up -d --remove-orphans sso-backend sso-worker
  wait_for_service sso-backend "$HEALTH_TIMEOUT_SECONDS"
  wait_for_service sso-worker 180

  run_smoke_tests
  compose ps
  log 'SSO backend deployment completed successfully'
}

main "$@"

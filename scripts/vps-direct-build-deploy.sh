#!/usr/bin/env bash
# ==============================================================================
# vps-direct-build-deploy.sh — Direct VPS image build and canary deploy
#
# Use only when registry-based CI/CD is not available yet. The script builds
# selected services on the VPS with an immutable local tag, updates them one by
# one with health gates, runs smoke checks, and rolls back touched services when
# a gate fails.
# ==============================================================================
set -Eeuo pipefail

TAG=""
PROJECT_DIR="/opt/sso-prototype-dev"
SERVICES=(sso-frontend sso-admin-vue)
PRUNE_BUILD_CACHE=0
MIN_REPLICAS="${MIN_REPLICAS:-2}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="$2"; shift ;;
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --services)
      IFS=',' read -r -a SERVICES <<<"$2"
      shift
      ;;
    --prune-build-cache) PRUNE_BUILD_CACHE=1 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

[[ -n "$TAG" ]] || { echo "ERROR: --tag required"; exit 1; }
[[ "$MIN_REPLICAS" =~ ^[1-9][0-9]*$ ]] || { echo "ERROR: MIN_REPLICAS must be a positive integer"; exit 1; }

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
DEPLOY_LOG="/var/log/sso-direct-build-deploy-$(date +%Y%m%d%H%M%S).log"
ROLLBACK_TAG="rollback-${TAG}"
ROLLBACK_STARTED=0
TOUCHED_SERVICES=()

declare -A LOCAL_IMAGE_MAP=(
  [sso-backend]="sso-dev-sso-backend"
  [sso-backend-worker]="sso-dev-sso-backend"
  [sso-frontend]="sso-dev-sso-frontend"
  [sso-admin-vue]="sso-dev-sso-admin-vue"
  [zitadel-login]="sso-dev-zitadel-login"
  [app-a-next]="sso-dev-app-a-next"
  [app-b-laravel]="sso-dev-app-b-laravel"
)

log()  { printf '\033[0;32m[DIRECT-DEPLOY]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; exit 1; }

env_value() {
  local key="$1" default="${2:-}" value
  value=$(
    awk -v key="$key" '
      /^[[:space:]]*#/ || $0 !~ /=/ { next }
      {
        candidate = $0
        sub(/=.*/, "", candidate)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", candidate)
        if (candidate == key) {
          sub(/^[^=]*=/, "", $0)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
          gsub(/^"|"$/, "", $0)
          print $0
          exit
        }
      }
    ' "$ENV_FILE"
  )
  printf '%s' "${value:-$default}"
}

compose() {
  APP_IMAGE_TAG="$TAG" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

rollback_compose() {
  APP_IMAGE_TAG="$ROLLBACK_TAG" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

desired_scale() {
  case "$1" in
    sso-frontend|sso-admin-vue|zitadel-login) printf '%s' "$MIN_REPLICAS" ;;
    *) printf '1' ;;
  esac
}

wait_healthy() {
  local svc="$1" timeout="${2:-180}" elapsed=0 desired status cid all_healthy
  local -a cids=()
  desired="$(desired_scale "$svc")"

  while [ "$elapsed" -lt "$timeout" ]; do
    mapfile -t cids < <(compose ps -q "$svc" 2>/dev/null || true)

    if [ "${#cids[@]}" -ge "$desired" ]; then
      all_healthy=1
      for cid in "${cids[@]}"; do
        status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo "unknown")
        case "$status" in
          healthy|running) ;;
          unhealthy|exited|dead)
            warn "  $svc replica $cid entered $status"
            docker logs --tail 40 "$cid" 2>&1 | tee -a "$DEPLOY_LOG" || true
            return 1
            ;;
          *) all_healthy=0 ;;
        esac
      done

      if [ "$all_healthy" -eq 1 ]; then
        log "  $svc has ${#cids[@]} healthy replica(s)"
        return 0
      fi
    fi

    sleep 5
    elapsed=$((elapsed + 5))
    [ $((elapsed % 20)) -eq 0 ] && log "  [${elapsed}s] $svc: waiting for ${desired} healthy replica(s)"
  done

  warn "  $svc timed out after ${timeout}s"
  return 1
}

smoke_check() {
  local label="$1" url="$2" pattern="$3" host="${4:-}" code
  if [ -n "$host" ] && [[ "$url" == https://* ]]; then
    code=$(curl -ksSL --resolve "$host:443:127.0.0.1" -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  elif [ -n "$host" ]; then
    code=$(curl -ksSL -H "Host: $host" -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  else
    code=$(curl -ksSL -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  fi

  if [[ "$code" =~ $pattern ]]; then
    log "  $label: HTTP $code"
    return 0
  fi

  warn "  $label: HTTP $code (expected $pattern)"
  return 1
}

rollback() {
  if [ "${#TOUCHED_SERVICES[@]}" -eq 0 ]; then
    warn "Rollback skipped; no runtime services were updated"
    return 0
  fi

  warn "Rollback started for touched services"
  for svc in "${TOUCHED_SERVICES[@]}"; do
    if [ -n "${LOCAL_IMAGE_MAP[$svc]:-}" ] && docker image inspect "${LOCAL_IMAGE_MAP[$svc]}:${ROLLBACK_TAG}" >/dev/null 2>&1; then
      warn "  rolling back $svc to ${ROLLBACK_TAG}"
      rollback_compose up -d --no-deps --scale "$svc=$(desired_scale "$svc")" "$svc" 2>&1 | tee -a "$DEPLOY_LOG" || true
      wait_healthy "$svc" 120 || true
    elif [ "$svc" = "sso-admin-vue" ]; then
      warn "  stopping canary $svc because no previous image exists"
      compose stop "$svc" 2>&1 | tee -a "$DEPLOY_LOG" || true
    fi
  done
}

build_service_image() {
  local svc="$1" image="${LOCAL_IMAGE_MAP[$svc]}:${TAG}"

  case "$svc" in
    sso-frontend)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        -f "$PROJECT_DIR/services/sso-frontend/Dockerfile" \
        --build-arg "VITE_SSO_BASE_URL=$(env_value SSO_BASE_URL)" \
        --build-arg "VITE_ADMIN_BASE_URL=$(env_value ADMIN_PANEL_BASE_URL)" \
        --build-arg "VITE_CLIENT_ID=$(env_value ADMIN_PANEL_CLIENT_ID sso-admin-panel)" \
        "$PROJECT_DIR" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    sso-admin-vue)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        --build-arg "VITE_ADMIN_BASE_URL=$(env_value ADMIN_PANEL_BASE_URL)" \
        --build-arg "VITE_PUBLIC_BASE_PATH=$(env_value SSO_ADMIN_VUE_BASE_PATH /__vue-preview)" \
        --build-arg "VITE_SSO_BASE_URL=$(env_value SSO_BASE_URL)" \
        --build-arg "VITE_ZITADEL_ISSUER_URL=$(env_value ZITADEL_ISSUER)" \
        "$PROJECT_DIR/services/sso-admin-vue" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    zitadel-login)
      log "  building $svc as $image"
      docker build --pull \
        -t "$image" \
        -f "$PROJECT_DIR/infra/zitadel-login/Dockerfile" \
        --build-arg "ZITADEL_VERSION=$(env_value ZITADEL_VERSION v4.11.0)" \
        "$PROJECT_DIR" 2>&1 | tee -a "$DEPLOY_LOG"
      ;;
    *)
      fail "Direct docker build is not mapped for service: $svc"
      ;;
  esac
}

build_selected_images() {
  local svc
  for svc in "${SERVICES[@]}"; do
    build_service_image "$svc" || return 1
  done
}

rollback_once() {
  local reason="${1:-Deploy failed unexpectedly}"
  if [ "$ROLLBACK_STARTED" -eq 1 ]; then
    return 1
  fi

  ROLLBACK_STARTED=1
  trap - ERR
  warn "$reason"
  rollback
  exit 1
}

trap 'rollback_once "Deploy failed unexpectedly"' ERR

log "Direct VPS deploy tag: $TAG"
log "Project dir: $PROJECT_DIR"
log "Services: ${SERVICES[*]}"

[[ -f "$COMPOSE_FILE" ]] || fail "Missing Compose file: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE"

cd "$PROJECT_DIR"

required_services="$(compose config --services)"
for svc in "${SERVICES[@]}"; do
  [[ -n "${LOCAL_IMAGE_MAP[$svc]:-}" ]] || fail "Unsupported service: $svc"
  grep -Fxq "$svc" <<<"$required_services" || fail "Compose does not define service: $svc"
done

if [ "$PRUNE_BUILD_CACHE" -eq 1 ]; then
  log "Pruning Docker build cache before VPS build"
  docker builder prune -f 2>&1 | tee -a "$DEPLOY_LOG" || true
fi

log "Snapshotting current images for rollback tag: $ROLLBACK_TAG"
for svc in "${SERVICES[@]}"; do
  cid=$(compose ps -q "$svc" 2>/dev/null | head -n 1 || true)
  if [ -n "$cid" ]; then
    image_id=$(docker inspect --format '{{.Image}}' "$cid")
    docker tag "$image_id" "${LOCAL_IMAGE_MAP[$svc]}:${ROLLBACK_TAG}"
    log "  $svc snapshot saved as ${LOCAL_IMAGE_MAP[$svc]}:${ROLLBACK_TAG}"
  else
    warn "  $svc is not currently running; rollback snapshot skipped"
  fi
done

log "Building selected images on VPS"
build_selected_images || rollback_once "Image build failed"

log "Rolling update with health gates"
for svc in "${SERVICES[@]}"; do
  log "  updating $svc"
  compose up -d --no-deps --scale "$svc=$(desired_scale "$svc")" "$svc" 2>&1 | tee -a "$DEPLOY_LOG" || rollback_once "Service update failed: $svc"
  TOUCHED_SERVICES+=("$svc")
  wait_healthy "$svc" 180 || rollback_once "Health gate failed: $svc"
done

SSO_DOMAIN=$(env_value SSO_DOMAIN)
ZITADEL_DOMAIN=$(env_value ZITADEL_DOMAIN)
SSO_ADMIN_VUE_BASE_PATH=$(env_value SSO_ADMIN_VUE_BASE_PATH /__vue-preview)

log "Running smoke checks"
smoke_check "SSO Discovery" "https://${SSO_DOMAIN}/.well-known/openid-configuration" "^200$" "$SSO_DOMAIN" || rollback_once "Smoke check failed: SSO Discovery"
smoke_check "Admin Panel" "https://${SSO_DOMAIN}/" "^200$" "$SSO_DOMAIN" || rollback_once "Smoke check failed: Admin Panel"
if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "sso-admin-vue"; then
  smoke_check "Vue Admin Canary" "https://${SSO_DOMAIN}${SSO_ADMIN_VUE_BASE_PATH}/healthz" "^200$" "$SSO_DOMAIN" || rollback_once "Smoke check failed: Vue Admin Canary"
fi
if printf '%s\n' "${SERVICES[@]}" | grep -Fxq "zitadel-login"; then
  smoke_check "Zitadel Login Health" "https://${ZITADEL_DOMAIN}/ui/v2/login/healthy" "^200$" "$ZITADEL_DOMAIN" || rollback_once "Smoke check failed: Zitadel Login Health"
fi

echo "$TAG" > /tmp/.sso-direct-deploy-tag
echo "$ROLLBACK_TAG" > /tmp/.sso-direct-rollback-tag

trap - ERR

log "Direct VPS deploy complete: $TAG"
log "Rollback tag available: $ROLLBACK_TAG"
log "Log: $DEPLOY_LOG"

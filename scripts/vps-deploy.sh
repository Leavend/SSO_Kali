#!/usr/bin/env bash
# ==============================================================================
# vps-deploy.sh — Zero-Downtime Deployment Script
#
# Executed by the CD pipeline on the VPS. This script:
# 1. Pulls tagged images from GHCR
# 2. Snapshots current state for rollback
# 3. Runs safe database migrations (separate from app lifecycle)
# 4. Rolling-updates each service with healthcheck gating
# 5. Runs smoke tests
# 6. Auto-rollbacks on failure
#
# Usage:
#   sudo bash vps-deploy.sh \
#     --tag v1.2.3 \
#     --registry ghcr.io/owner/sso-prototype \
#     --project-dir /opt/sso-prototype-dev \
#     --sha abc1234
# ==============================================================================
set -Eeuo pipefail

# ─── Argument parsing ────────────────────────────────────────────────────────
TAG=""
REGISTRY=""
PROJECT_DIR="/opt/sso-prototype-dev"
SHA=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="$2"; shift ;;
    --registry) REGISTRY="$2"; shift ;;
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --sha) SHA="$2"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

[[ -n "$TAG" ]]      || { echo "ERROR: --tag required"; exit 1; }
[[ -n "$REGISTRY" ]] || { echo "ERROR: --registry required"; exit 1; }

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
DEPLOY_LOG="/var/log/sso-deploy-$(date +%Y%m%d%H%M%S).log"
ROLLBACK_TAG_FILE="/tmp/.sso-deploy-rollback-tag"
export APP_IMAGE_TAG="$TAG"

log()  { printf '\033[0;32m[DEPLOY]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; }
warn() { printf '\033[1;33m[WARN]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; }
fail() { printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" | tee -a "$DEPLOY_LOG"; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

# Services that use custom-built images (order matters: deps first)
APP_SERVICES=(sso-backend sso-backend-worker sso-frontend sso-admin-vue zitadel-login zitadel-login-vue app-a-next app-b-laravel)

# Core services that trigger hard rollback if unhealthy
CORE_SERVICES=(sso-backend sso-backend-worker sso-frontend sso-admin-vue)

is_core_service() {
  local svc="$1"
  for core in "${CORE_SERVICES[@]}"; do
    [[ "$core" == "$svc" ]] && return 0
  done
  return 1
}

# Map service name → image name in registry
declare -A IMAGE_MAP=(
  [sso-backend]="sso-backend"
  [sso-backend-worker]="sso-backend"
  [sso-frontend]="sso-frontend"
  [sso-admin-vue]="sso-admin-vue"
  [zitadel-login]="zitadel-login"
  [zitadel-login-vue]="zitadel-login-vue"
  [app-a-next]="app-a-next"
  [app-b-laravel]="app-b-laravel"
)

declare -A LOCAL_IMAGE_MAP=(
  [sso-backend]="sso-dev-sso-backend"
  [sso-backend-worker]="sso-dev-sso-backend"
  [sso-frontend]="sso-dev-sso-frontend"
  [sso-admin-vue]="sso-dev-sso-admin-vue"
  [zitadel-login]="sso-dev-zitadel-login"
  [zitadel-login-vue]="sso-dev-zitadel-login-vue"
  [app-a-next]="sso-dev-app-a-next"
  [app-b-laravel]="sso-dev-app-b-laravel"
)

log "═══════════════════════════════════════════"
log "  Zero-Downtime Deploy: ${TAG}"
log "  Registry: ${REGISTRY}"
log "  Project:  ${PROJECT_DIR}"
log "═══════════════════════════════════════════"

cd "$PROJECT_DIR"

# ─── Preflight: control plane alignment ──────────────────────────────────────
log "Preflight: Validating release control plane..."

[[ -f "$COMPOSE_FILE" ]] || fail "Missing Compose file: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE"

COMPOSE_SERVICES="$(compose config --services)"
for svc in "${APP_SERVICES[@]}"; do
  if ! grep -Fxq "$svc" <<<"$COMPOSE_SERVICES"; then
    fail "Compose control plane does not define required service: $svc"
  fi
done

if ! grep -Eq '^ZITADEL_LOGIN_VUE_COOKIE_SECRET=.{32,}$' "$ENV_FILE" || grep -Eq '^ZITADEL_LOGIN_VUE_COOKIE_SECRET=REPLACE_' "$ENV_FILE"; then
  fail "ZITADEL_LOGIN_VUE_COOKIE_SECRET must be set before deploying zitadel-login-vue"
fi

log "Preflight complete - Compose control plane is aligned"

# ─── Phase 1: Save current state for rollback ────────────────────────────────
log "Phase 1/5: Saving rollback state..."

PREV_TAG=""
if [ -f "$ROLLBACK_TAG_FILE" ]; then
  PREV_TAG=$(cat "$ROLLBACK_TAG_FILE")
fi

# Snapshot current running container images
for svc in "${APP_SERVICES[@]}"; do
  CID=$(compose ps -q "$svc" 2>/dev/null || true)
  if [ -n "$CID" ]; then
    IMG=$(docker inspect --format '{{.Config.Image}}' "$CID" 2>/dev/null || true)
    log "  Current $svc: $IMG"
  fi
done

log "✅ Phase 1 complete"

# ─── Phase 2: Pull images ────────────────────────────────────────────────────
log "Phase 2/5: Pulling images for tag ${TAG}..."

PULL_ERRORS=0
for svc in "${APP_SERVICES[@]}"; do
  IMG_NAME="${IMAGE_MAP[$svc]}"
  FULL_IMAGE="${REGISTRY}/${IMG_NAME}:${TAG}"
  log "  Pulling ${FULL_IMAGE}..."
  if docker pull "$FULL_IMAGE" 2>&1 | tail -1; then
    # Re-tag to match compose service image name
    LOCAL_TAG="${LOCAL_IMAGE_MAP[$svc]}:${TAG}"
    docker tag "$FULL_IMAGE" "$LOCAL_TAG"
  else
    warn "  Failed to pull ${FULL_IMAGE}"
    PULL_ERRORS=$((PULL_ERRORS + 1))
  fi
done

if [ "$PULL_ERRORS" -gt 0 ]; then
  fail "Failed to pull $PULL_ERRORS image(s). Aborting deploy."
fi

log "✅ Phase 2 complete — All images pulled"

# ─── Phase 3: Safe database migrations ───────────────────────────────────────
log "Phase 3/5: Running database migrations..."

# sso-backend migrations (one-shot container, NOT in app lifecycle)
compose run --rm --no-deps -T sso-backend \
  sh -lc 'mkdir -p storage/app/oidc storage/framework/{cache,sessions,views} storage/logs && php artisan migrate --force' \
  2>&1 | tee -a "$DEPLOY_LOG" || warn "sso-backend migration had warnings"

# app-b-laravel migrations
compose run --rm --no-deps -T app-b-laravel \
  sh -lc 'mkdir -p storage/framework/{cache,sessions,views} storage/logs && php artisan migrate --force' \
  2>&1 | tee -a "$DEPLOY_LOG" || warn "app-b-laravel migration had warnings"

log "✅ Phase 3 complete — Migrations applied"

# ─── Phase 4: Rolling update with healthcheck gating ─────────────────────────
log "Phase 4/5: Rolling update..."

wait_healthy() {
  local svc="$1" timeout="${2:-180}" elapsed=0 status
  while [ $elapsed -lt $timeout ]; do
    CID=$(compose ps -q "$svc" 2>/dev/null || true)
    if [ -n "$CID" ]; then
      status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CID" 2>/dev/null || echo "unknown")
      case "$status" in
        healthy|running) log "  ✅ $svc is $status"; return 0 ;;
        unhealthy|exited|dead)
          warn "  ❌ $svc entered $status"
          docker logs --tail 20 "$CID" 2>&1 | tee -a "$DEPLOY_LOG" || true
          return 1
          ;;
      esac
    fi
    sleep 5
    elapsed=$((elapsed + 5))
    [ $((elapsed % 15)) -eq 0 ] && log "  [${elapsed}s] $svc: $status"
  done
  warn "  ⏱ $svc timed out after ${timeout}s"
  return 1
}

DEPLOY_FAILED=0
DOWNSTREAM_WARN=0

for svc in "${APP_SERVICES[@]}"; do
  log "  Updating $svc..."
  compose up -d --no-deps "$svc" 2>&1 | tee -a "$DEPLOY_LOG"

  if ! wait_healthy "$svc" 180; then
    if is_core_service "$svc"; then
      DEPLOY_FAILED=1
      warn "Core service $svc failed healthcheck — triggering rollback"
      break
    else
      DOWNSTREAM_WARN=1
      warn "Downstream app $svc unhealthy — continuing (non-critical)"
    fi
  fi
done

if [ "$DEPLOY_FAILED" -eq 1 ]; then
  log "⚠️  Deploy failed — rolling back..."
  if [ -n "$PREV_TAG" ]; then
    bash "$(dirname "$0")/vps-rollback.sh" \
      --tag "$PREV_TAG" \
      --registry "$REGISTRY" \
      --project-dir "$PROJECT_DIR"
  else
    warn "No previous tag to rollback to. Manual intervention required."
  fi
  fail "Deploy of ${TAG} failed. Rolled back to ${PREV_TAG:-unknown}."
fi

log "✅ Phase 4 complete — All services updated"

# ─── Phase 5: Smoke tests ────────────────────────────────────────────────────
log "Phase 5/5: Running smoke tests..."

SMOKE_FAILED=0

smoke_check() {
  local label="$1" url="$2" pattern="$3"
  local host="${4:-}"
  local code
  if [ -n "$host" ]; then
    code=$(curl -LksS -H "Host: $host" -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  else
    code=$(curl -LksS -o /dev/null -w '%{http_code}' --max-time 15 "$url" || echo "000")
  fi

  if [[ "$code" =~ $pattern ]]; then
    log "  ✅ $label: HTTP $code"
  else
    warn "  ⚠️  $label: HTTP $code (expected $pattern)"
    SMOKE_FAILED=1
  fi
}

SSO_DOMAIN=$(awk -F= '/^SSO_DOMAIN=/ {print $2}' "$ENV_FILE")
ZITADEL_DOMAIN=$(awk -F= '/^ZITADEL_DOMAIN=/ {print $2}' "$ENV_FILE")
APP_A_DOMAIN=$(awk -F= '/^APP_A_DOMAIN=/ {print $2}' "$ENV_FILE")
APP_B_DOMAIN=$(awk -F= '/^APP_B_DOMAIN=/ {print $2}' "$ENV_FILE")
SSO_ADMIN_VUE_BASE_PATH=$(awk -F= '/^SSO_ADMIN_VUE_BASE_PATH=/ {print $2}' "$ENV_FILE")
SSO_ADMIN_VUE_BASE_PATH="${SSO_ADMIN_VUE_BASE_PATH:-/__vue-preview}"

smoke_check "SSO Discovery"     "http://127.0.0.1/.well-known/openid-configuration" "^200$" "$SSO_DOMAIN"
smoke_check "ZITADEL Discovery" "http://127.0.0.1/.well-known/openid-configuration" "^200$" "$ZITADEL_DOMAIN"
smoke_check "Admin Panel"       "http://127.0.0.1/"                                  "^200$" "$SSO_DOMAIN"
smoke_check "Vue Admin Canary"  "http://127.0.0.1${SSO_ADMIN_VUE_BASE_PATH}/healthz" "^200$" "$SSO_DOMAIN"

ZITADEL_LOGIN_VUE_BASE_PATH=$(awk -F= '/^ZITADEL_LOGIN_VUE_BASE_PATH=/ {print $2}' "$ENV_FILE")
ZITADEL_LOGIN_VUE_BASE_PATH="${ZITADEL_LOGIN_VUE_BASE_PATH:-/ui/v2/login-vue}"
smoke_check "ZITADEL Vue Login Canary" "http://127.0.0.1${ZITADEL_LOGIN_VUE_BASE_PATH}/healthz" "^200$" "$ZITADEL_DOMAIN"

if [ -n "$APP_A_DOMAIN" ]; then
  smoke_check "App A" "http://127.0.0.1/" "^(200|30[1278]|404)$" "$APP_A_DOMAIN"
fi

if [ -n "$APP_B_DOMAIN" ]; then
  smoke_check "App B" "http://127.0.0.1/" "^(200|30[1278]|404)$" "$APP_B_DOMAIN"
fi

if [ "$SMOKE_FAILED" -eq 1 ]; then
  log "Smoke tests failed - rolling back..."
  if [ -n "$PREV_TAG" ]; then
    bash "$(dirname "$0")/vps-rollback.sh" \
      --tag "$PREV_TAG" \
      --registry "$REGISTRY" \
      --project-dir "$PROJECT_DIR"
    fail "Deploy of ${TAG} failed smoke tests. Rolled back to ${PREV_TAG}."
  fi
  fail "Deploy of ${TAG} failed smoke tests and no previous tag was available."
fi

# Save current tag for future rollback
echo "$TAG" > "$ROLLBACK_TAG_FILE"

log ""
log "═══════════════════════════════════════════"
log "  🎉 DEPLOY COMPLETE: ${TAG}"
log "  SHA: ${SHA}"
log "  Log: ${DEPLOY_LOG}"
log "═══════════════════════════════════════════"

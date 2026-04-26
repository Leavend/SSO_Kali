#!/usr/bin/env bash
# ==============================================================================
# vps-rollback.sh — Instant Rollback (< 30 seconds)
#
# Pulls a previously-tagged set of images from GHCR and replaces running
# containers. No rebuild, no migration — pure image swap.
#
# Usage (from CI or emergency SSH):
#   sudo bash vps-rollback.sh \
#     --tag v1.1.0 \
#     --registry ghcr.io/owner/sso-prototype \
#     --project-dir /opt/sso-prototype-dev
# ==============================================================================
set -Eeuo pipefail

TAG=""
REGISTRY=""
PROJECT_DIR="/opt/sso-prototype-dev"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) TAG="$2"; shift ;;
    --registry) REGISTRY="$2"; shift ;;
    --project-dir) PROJECT_DIR="$2"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
  shift
done

[[ -n "$TAG" ]]      || { echo "ERROR: --tag required"; exit 1; }
[[ -n "$REGISTRY" ]] || { echo "ERROR: --registry required"; exit 1; }

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
ROLLBACK_TAG_FILE="/tmp/.sso-deploy-rollback-tag"
export APP_IMAGE_TAG="$TAG"

log()  { printf '\033[1;33m[ROLLBACK]\033[0m %s\n' "$*"; }
fail() { printf '\033[0;31m[ROLLBACK][FAIL]\033[0m %s\n' "$*"; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

APP_SERVICES=(sso-backend sso-backend-worker sso-frontend sso-admin-vue zitadel-login zitadel-login-vue app-a-next app-b-laravel)

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

START_TIME=$(date +%s)

log "═══════════════════════════════════════════"
log "  🔄 ROLLBACK TO: ${TAG}"
log "═══════════════════════════════════════════"

cd "$PROJECT_DIR"

# ─── Preflight: rollback target must match the live Compose control plane ────
log "Validating rollback control plane..."

[[ -f "$COMPOSE_FILE" ]] || fail "Missing Compose file: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || fail "Missing env file: $ENV_FILE"

COMPOSE_SERVICES="$(compose config --services)"
for svc in "${APP_SERVICES[@]}"; do
  if ! grep -Fxq "$svc" <<<"$COMPOSE_SERVICES"; then
    fail "Compose control plane does not define required service: $svc"
  fi
done

log "Control plane validation passed"

# ─── Pull rollback images ────────────────────────────────────────────────────
log "Pulling images..."

for svc in "${APP_SERVICES[@]}"; do
  IMG="${REGISTRY}/${IMAGE_MAP[$svc]}:${TAG}"
  docker pull "$IMG" 2>&1 | tail -1 || fail "Cannot pull $IMG"
  LOCAL="${LOCAL_IMAGE_MAP[$svc]}:${TAG}"
  docker tag "$IMG" "$LOCAL"
done

# ─── Replace containers ──────────────────────────────────────────────────────
log "Replacing containers..."

for svc in "${APP_SERVICES[@]}"; do
  compose up -d --no-deps "$svc" 2>&1 | tail -1
done

# ─── Quick health verification ───────────────────────────────────────────────
log "Verifying health..."

sleep 10  # Give containers time to start

HEALTHY=0
for svc in "${APP_SERVICES[@]}"; do
  CID=$(compose ps -q "$svc" 2>/dev/null || true)
  if [ -n "$CID" ]; then
    STATUS=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CID" 2>/dev/null || echo "unknown")
    log "  $svc: $STATUS"
    [[ "$STATUS" == "healthy" || "$STATUS" == "running" ]] && HEALTHY=$((HEALTHY + 1))
  fi
done

# Save rollback tag
echo "$TAG" > "$ROLLBACK_TAG_FILE"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

log ""
log "═══════════════════════════════════════════"
log "  🔄 ROLLBACK COMPLETE: ${TAG}"
log "  Services OK: ${HEALTHY}/${#APP_SERVICES[@]}"
log "  Duration: ${ELAPSED}s"
log "═══════════════════════════════════════════"

if [ "$ELAPSED" -le 30 ]; then
  log "  ✅ Under 30-second SLA"
else
  log "  ⚠️  Exceeded 30-second SLA (${ELAPSED}s)"
fi

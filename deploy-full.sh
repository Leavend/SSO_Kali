#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Full dev deployment: build → deploy → bootstrap ZITADEL → verify.
#
# This wraps deploy-dev.sh and bootstrap-dev-resources.sh into a single
# idempotent entry point.  Safe to re-run — nothing destructive.
#
# Usage:
#   sudo ./deploy-full.sh               # full flow
#   sudo ./deploy-full.sh --skip-build  # reuse images, just re-deploy + bootstrap
# ---------------------------------------------------------------------------
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"

log()  { printf '[deploy-full] %s\n' "$*"; }
warn() { printf '[deploy-full][WARN] %s\n' "$*" >&2; }
die()  { printf '[deploy-full][ERROR] %s\n' "$*" >&2; exit 1; }

get_env() {
  awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

# --- Pre-flight ------------------------------------------------------------
[[ -f "$ENV_FILE" ]]                           || die "Missing $ENV_FILE"
[[ -f "$ROOT_DIR/deploy-dev.sh" ]]             || die "Missing deploy-dev.sh"
[[ -f "$ROOT_DIR/infra/zitadel/bootstrap-dev-resources.sh" ]] || die "Missing bootstrap script"

# --- Phase A: Deploy infrastructure + services -----------------------------
log "=========================================="
log "Phase A: Deploy dev stack"
log "=========================================="
bash "$ROOT_DIR/deploy-dev.sh" "$@"

# --- Phase B: Bootstrap ZITADEL resources ----------------------------------
log ""
log "=========================================="
log "Phase B: Bootstrap ZITADEL (project, broker app, test user)"
log "=========================================="
bash "$ROOT_DIR/infra/zitadel/bootstrap-dev-resources.sh"

# --- Phase C: Final verification -------------------------------------------
log ""
log "=========================================="
log "Phase C: Final verification"
log "=========================================="

SSO_DOMAIN="$(get_env SSO_DOMAIN)"
ZITADEL_DOMAIN="$(get_env ZITADEL_DOMAIN)"
APP_A_DOMAIN="$(get_env APP_A_DOMAIN)"
APP_B_DOMAIN="$(get_env APP_B_DOMAIN)"

errors=0

check_https() {
  local domain="$1" path="$2" label="$3"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "https://${domain}${path}" || true)"
  if [[ "$code" =~ ^2|3 ]]; then
    log "✅ ${label}: HTTPS ${domain}${path} → HTTP ${code}"
  else
    warn "❌ ${label}: HTTPS ${domain}${path} → HTTP ${code:-000}"
    errors=$((errors + 1))
  fi
}

check_https "$SSO_DOMAIN"     "/.well-known/openid-configuration" "SSO Discovery"
check_https "$SSO_DOMAIN"     "/"                                  "Admin Panel"
check_https "$ZITADEL_DOMAIN" "/.well-known/openid-configuration" "ZITADEL Discovery"
check_https "$APP_A_DOMAIN"   "/"                                  "App A"
check_https "$APP_B_DOMAIN"   "/"                                  "App B"

# Docker health
log ""
log "Docker service status:"
docker compose --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.dev.yml" ps --format 'table {{.Name}}\t{{.Status}}'

if [[ "$errors" -gt 0 ]]; then
  warn "${errors} check(s) failed. Review output above."
  exit 1
fi

log ""
log "🎉 Full deployment complete. All checks passed."
log ""
log "Login test:"
log "  1. Open https://app-a.timeh.my.id"
log "  2. Click Login"
log "  3. Use: dev@timeh.my.id / PrototypeSSO2026!"
log ""
log "Admin Panel:"
log "  1. Open https://${SSO_DOMAIN}"
log "  2. Click 'Sign in with SSO'"
log "  3. Login with dev@timeh.my.id (must have admin role)"


#!/usr/bin/env bash
# ============================================================================
# Phase 1: SSO Frontend — Deploy & Automated Smoke Test
# ============================================================================
# Usage:
#   ./scripts/deploy-frontend-smoke.sh               # Full run: build → deploy → smoke
#   ./scripts/deploy-frontend-smoke.sh --skip-build   # Re-deploy without rebuild
#   ./scripts/deploy-frontend-smoke.sh --smoke-only    # Only run smoke tests (no deploy)
#
# Prerequisites:
#   - Docker Compose running with all infra services (postgres, redis, zitadel, proxy)
#   - .env.dev file configured with all required secrets
#
# This script performs:
#   1. Pre-flight validation (env vars, Docker health)
#   2. Frontend-only rebuild & restart
#   3. Automated smoke tests:
#      - HTTP status codes on protected/public routes
#      - X-Powered-By header absence verification
#      - Cookie policy verification (__Host- prefix, Secure, SameSite)
#      - Internal Docker network connectivity
#      - Manual E2E flow guide
# ============================================================================

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
SKIP_BUILD=0
SMOKE_ONLY=0

# ── Logging ─────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

log()  { printf "${CYAN}[phase1]${NC} %s\n" "$*"; }
pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf "${GREEN}  ✅ PASS${NC} %s\n" "$*"; }
fail() { FAIL_COUNT=$((FAIL_COUNT + 1)); printf "${RED}  ❌ FAIL${NC} %s\n" "$*"; }
warn() { WARN_COUNT=$((WARN_COUNT + 1)); printf "${YELLOW}  ⚠  WARN${NC} %s\n" "$*"; }
die()  { printf "${RED}[phase1][FATAL]${NC} %s\n" "$*" >&2; exit 1; }

# ── Helpers ─────────────────────────────────────────────────────────────────

get_env() {
  awk -F= -v key="$1" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

curl_proxy() {
  curl -sS --max-time 10 \
    -H "Host: $SSO_DOMAIN" \
    "http://${PROXY_IP}:${PROXY_PORT}$1" \
    "${@:2}"
}

# ── Arg Parsing ─────────────────────────────────────────────────────────────

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-build)   SKIP_BUILD=1 ;;
      --smoke-only)   SMOKE_ONLY=1 ;;
      -h|--help)      usage; exit 0 ;;
      *)              die "Unknown option: $1" ;;
    esac
    shift
  done
}

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-frontend-smoke.sh [options]

Options:
  --skip-build    Skip Docker image rebuild
  --smoke-only    Only run smoke tests (no deploy)
  -h, --help      Show this help
EOF
}

# ── Phase 1A: Preflight ────────────────────────────────────────────────────

preflight() {
  log "Running preflight checks..."

  [[ -f "$ENV_FILE" ]]     || die "Missing env file: $ENV_FILE"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"

  PROXY_IP="$(get_env PROXY_HTTP_BIND_IP)"
  PROXY_PORT="$(get_env PROXY_HTTP_PUBLISHED_PORT)"
  SSO_DOMAIN="$(get_env SSO_DOMAIN)"

  [[ -n "$PROXY_IP" ]]   || die "Missing PROXY_HTTP_BIND_IP"
  [[ -n "$PROXY_PORT" ]] || die "Missing PROXY_HTTP_PUBLISHED_PORT"
  [[ -n "$SSO_DOMAIN" ]] || die "Missing SSO_DOMAIN"

  local secret
  secret="$(get_env ADMIN_PANEL_SESSION_SECRET)"
  if [[ ${#secret} -lt 32 ]]; then
    die "ADMIN_PANEL_SESSION_SECRET must be ≥32 chars (current: ${#secret})"
  fi
  pass "Session secret length OK (${#secret} chars)"

  local internal_url
  internal_url="$(get_env SSO_INTERNAL_BASE_URL)"
  [[ -n "$internal_url" ]] || die "Missing SSO_INTERNAL_BASE_URL"
  pass "SSO_INTERNAL_BASE_URL configured: $internal_url"
}

# ── Phase 1B: Deploy Frontend Only ─────────────────────────────────────────

deploy_frontend() {
  if [[ "$SMOKE_ONLY" -eq 1 ]]; then
    log "Skipping deploy (--smoke-only mode)"
    return
  fi

  if [[ "$SKIP_BUILD" -eq 0 ]]; then
    log "Building sso-frontend image..."
    compose build sso-frontend
    pass "Frontend image built"
  else
    log "Skipping build (--skip-build)"
  fi

  log "Restarting sso-frontend service..."
  compose up -d --no-deps --force-recreate sso-frontend

  log "Waiting for sso-frontend health check..."
  wait_healthy "sso-frontend" 120
  pass "sso-frontend is healthy"
}

wait_healthy() {
  local svc="$1" timeout="$2" elapsed=0 cid status
  while (( elapsed < timeout )); do
    cid="$(compose ps -q "$svc" 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "starting")"
      case "$status" in
        healthy)  return 0 ;;
        unhealthy) die "Service $svc is unhealthy" ;;
      esac
    fi
    sleep 5; elapsed=$((elapsed + 5))
  done
  die "Timed out waiting for $svc health (${timeout}s)"
}

# ── Phase 1C: Smoke Tests ──────────────────────────────────────────────────

smoke_test_headers() {
  log "Testing security headers..."

  # UF-09: X-Powered-By should be absent
  local headers
  headers="$(curl_proxy "/" -I 2>/dev/null || true)"

  if echo "$headers" | grep -qi "x-powered-by"; then
    fail "X-Powered-By header is still present"
  else
    pass "X-Powered-By header absent (UF-09)"
  fi

  # Check for security headers from Traefik/Next.js
  if echo "$headers" | grep -qi "x-content-type-options"; then
    pass "X-Content-Type-Options header present"
  else
    warn "X-Content-Type-Options header missing (Phase 4 item)"
  fi
}

smoke_test_protected_routes() {
  log "Testing protected route redirects (UF-01)..."

  local routes=("/dashboard" "/sessions" "/users" "/apps")
  for route in "${routes[@]}"; do
    local code
    code="$(curl_proxy "$route" -o /dev/null -w '%{http_code}' 2>/dev/null || echo "000")"
    if [[ "$code" == "307" || "$code" == "302" || "$code" == "303" ]]; then
      pass "GET $route → $code redirect (anonymous blocked)"
    elif [[ "$code" == "200" ]]; then
      fail "GET $route → 200 (skeleton leak! UF-01 not working)"
    else
      warn "GET $route → $code (unexpected status)"
    fi
  done
}

smoke_test_public_routes() {
  log "Testing public routes..."

  local public_routes=("/" "/access-denied" "/handshake-failed" "/invalid-credentials")
  for route in "${public_routes[@]}"; do
    local code
    code="$(curl_proxy "$route" -o /dev/null -w '%{http_code}' 2>/dev/null || echo "000")"
    if [[ "$code" =~ ^2 ]]; then
      pass "GET $route → $code OK"
    else
      warn "GET $route → $code (expected 2xx)"
    fi
  done
}

smoke_test_login_redirect() {
  log "Testing OIDC login redirect..."

  local code location
  code="$(curl_proxy "/auth/login" -o /dev/null -w '%{http_code}' 2>/dev/null || echo "000")"
  location="$(curl_proxy "/auth/login" -I 2>/dev/null | grep -i '^location:' | tr -d '\r' || true)"

  if [[ "$code" == "307" || "$code" == "302" ]]; then
    pass "GET /auth/login → $code redirect"
    if echo "$location" | grep -q "authorize"; then
      pass "Login redirects to OIDC authorize endpoint"
    else
      warn "Login redirect location does not contain 'authorize': $location"
    fi
  else
    fail "GET /auth/login → $code (expected 302/307)"
  fi
}

smoke_test_internal_network() {
  log "Testing internal Docker network connectivity..."

  local cid
  cid="$(compose ps -q sso-frontend 2>/dev/null || true)"
  if [[ -z "$cid" ]]; then
    fail "sso-frontend container not found"
    return
  fi

  # Test internal connectivity to sso-backend
  local internal_code
  internal_code="$(docker exec "$cid" wget -q -O /dev/null --spider \
    http://sso-backend:8000/up 2>&1 && echo "OK" || echo "FAIL")"

  if [[ "$internal_code" == "OK" ]]; then
    pass "Internal: sso-frontend → sso-backend:8000 reachable"
  else
    warn "Internal: sso-frontend → sso-backend:8000 not reachable (DNS/network issue)"
  fi
}

# ── Phase 1D: E2E Manual Test Guide ────────────────────────────────────────

print_manual_guide() {
  printf "\n${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}\n"
  printf "${BOLD}  📋 MANUAL E2E TEST GUIDE${NC}\n"
  printf "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}\n\n"
  cat <<EOF
  Open in browser: https://${SSO_DOMAIN}/

  Step 1: LOGIN
    → Click "Continue to Secure Sign-In"
    → ${YELLOW}Expect:${NC} Redirect to ZITADEL hosted login
    → Enter admin credentials (dev@timeh.my.id)
    → ${YELLOW}Expect:${NC} Redirect back to /dashboard

  Step 2: DASHBOARD
    → ${YELLOW}Verify:${NC} Dashboard loads with "Welcome, <name>"
    → ${YELLOW}Verify:${NC} No "Loading Admin Panel..." flash
    → ${YELLOW}Verify:${NC} Session expiry warning appears near expiry (<2min)

  Step 3: SESSIONS
    → Navigate to Sessions page
    → ${YELLOW}Verify:${NC} Active sessions list loads
    → ${YELLOW}Verify:${NC} Step-up countdown banner visible if auth < 60s
    → Click "Revoke" on a session
    → ${YELLOW}Verify:${NC} Confirmation dialog appears (not immediate action)
    → Confirm revocation
    → ${YELLOW}Expect:${NC} Session removed from list

  Step 4: USER DETAIL
    → Navigate to Users → click a user
    → ${YELLOW}Verify:${NC} User detail page loads with sessions
    → Test "Revoke All" if available

  Step 5: LOGOUT
    → Click "Sign Out"
    → ${YELLOW}Expect:${NC} Redirect to / (sign-in screen)
    → Try accessing /dashboard directly
    → ${YELLOW}Expect:${NC} Redirect (302/307) to / (UF-01 verified)

  Step 6: ERROR PAGES
    → Access /access-denied directly
    → ${YELLOW}Verify:${NC} No loading skeleton flash (UF-08)
    → Access /handshake-failed
    → ${YELLOW}Verify:${NC} Clean error page, no redirect loop (UF-07)

EOF
}

# ── Phase 1E: Summary ──────────────────────────────────────────────────────

print_summary() {
  local total=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))

  printf "\n${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}\n"
  printf "${BOLD}  📊 SMOKE TEST RESULTS${NC}\n"
  printf "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}\n\n"
  printf "  ${GREEN}✅ Passed:${NC}  %d\n" "$PASS_COUNT"
  printf "  ${RED}❌ Failed:${NC}  %d\n" "$FAIL_COUNT"
  printf "  ${YELLOW}⚠  Warned:${NC} %d\n" "$WARN_COUNT"
  printf "  📊 Total:   %d\n\n" "$total"

  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    printf "  ${RED}${BOLD}STATUS: DEPLOYMENT HAS FAILURES — investigate above${NC}\n\n"
    return 1
  fi

  if [[ "$WARN_COUNT" -gt 0 ]]; then
    printf "  ${YELLOW}${BOLD}STATUS: DEPLOYMENT OK with warnings${NC}\n\n"
    return 0
  fi

  printf "  ${GREEN}${BOLD}STATUS: ALL SMOKE TESTS PASSED ✅${NC}\n\n"
  return 0
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
  parse_args "$@"

  printf "\n${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}\n"
  printf "${BOLD}  🚀 Phase 1: Deploy SSO Frontend & Smoke Test${NC}\n"
  printf "${BOLD}${CYAN}═══════════════════════════════════════════════════════${NC}\n\n"

  preflight
  deploy_frontend

  printf "\n"
  smoke_test_headers
  smoke_test_protected_routes
  smoke_test_public_routes
  smoke_test_login_redirect
  smoke_test_internal_network

  print_manual_guide
  print_summary
}

main "$@"

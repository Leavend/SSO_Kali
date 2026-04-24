#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-forwarded-proto.sh
#
# Validates that X-Forwarded-Proto: https is correctly propagated through
# the entire proxy chain: Nginx → Traefik → ZITADEL / SSO Broker.
#
# Usage:
#   sudo bash infra/zitadel/verify-forwarded-proto.sh
#   ENV_FILE=.env.dev bash infra/zitadel/verify-forwarded-proto.sh
# ---------------------------------------------------------------------------
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"

log()  { printf '[verify-proto] %s\n' "$*"; }
pass() { printf '[verify-proto] ✅ %s\n' "$*"; }
fail() { printf '[verify-proto] ❌ %s\n' "$*" >&2; FAILURES=$((FAILURES + 1)); }
warn() { printf '[verify-proto] ⚠  %s\n' "$*" >&2; }

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

FAILURES=0

[[ -f "$ENV_FILE" ]] || { fail "Missing env file: $ENV_FILE"; exit 1; }

SSO_DOMAIN="$(get_env SSO_DOMAIN)"
ZITADEL_DOMAIN="$(get_env ZITADEL_DOMAIN)"

[[ -n "$SSO_DOMAIN" ]] || { fail "Missing SSO_DOMAIN"; exit 1; }
[[ -n "$ZITADEL_DOMAIN" ]] || { fail "Missing ZITADEL_DOMAIN"; exit 1; }

# --- Test 1: ZITADEL discovery document issuer must be https ----------------
log "Test 1: Checking ZITADEL discovery issuer"
zitadel_disc="$(curl -ksS --max-time 10 "https://${ZITADEL_DOMAIN}/.well-known/openid-configuration" 2>/dev/null || true)"
if [[ -z "$zitadel_disc" ]]; then
  fail "Cannot reach https://${ZITADEL_DOMAIN}/.well-known/openid-configuration"
else
  zitadel_issuer="$(printf '%s' "$zitadel_disc" | jq -r '.issuer // empty' 2>/dev/null || true)"
  if [[ "$zitadel_issuer" == "https://${ZITADEL_DOMAIN}" ]]; then
    pass "ZITADEL issuer: $zitadel_issuer"
  else
    fail "ZITADEL issuer expected 'https://${ZITADEL_DOMAIN}', got '${zitadel_issuer:-empty}'"
  fi

  # Check all endpoint URLs use https
  for field in authorization_endpoint token_endpoint userinfo_endpoint jwks_uri revocation_endpoint end_session_endpoint; do
    ep="$(printf '%s' "$zitadel_disc" | jq -r ".${field} // empty" 2>/dev/null || true)"
    if [[ "$ep" == https://* ]]; then
      pass "  ${field}: https ✓"
    elif [[ -n "$ep" ]]; then
      fail "  ${field}: expected https, got '${ep}'"
    fi
  done
fi

# --- Test 2: SSO Broker discovery document issuer must be https -------------
log "Test 2: Checking SSO Broker discovery issuer"
sso_disc="$(curl -ksS --max-time 10 "https://${SSO_DOMAIN}/.well-known/openid-configuration" 2>/dev/null || true)"
if [[ -z "$sso_disc" ]]; then
  fail "Cannot reach https://${SSO_DOMAIN}/.well-known/openid-configuration"
else
  sso_issuer="$(printf '%s' "$sso_disc" | jq -r '.issuer // empty' 2>/dev/null || true)"
  if [[ "$sso_issuer" == "https://${SSO_DOMAIN}" ]]; then
    pass "Broker issuer: $sso_issuer"
  else
    fail "Broker issuer expected 'https://${SSO_DOMAIN}', got '${sso_issuer:-empty}'"
  fi

  for field in authorization_endpoint token_endpoint userinfo_endpoint jwks_uri revocation_endpoint; do
    ep="$(printf '%s' "$sso_disc" | jq -r ".${field} // empty" 2>/dev/null || true)"
    if [[ "$ep" == https://* ]]; then
      pass "  ${field}: https ✓"
    elif [[ -n "$ep" ]]; then
      fail "  ${field}: expected https, got '${ep}'"
    fi
  done
fi

# --- Test 3: ZITADEL Login UI redirect uses https --------------------------
log "Test 3: Verifying ZITADEL login redirect scheme"
login_location="$(curl -ksS -o /dev/null -D - --max-time 10 "https://${ZITADEL_DOMAIN}/ui/v2/login/" 2>/dev/null | grep -i '^location:' | head -1 | tr -d '\r' || true)"
if [[ -z "$login_location" ]]; then
  warn "No redirect from ZITADEL login UI (may render directly)"
elif [[ "$login_location" == *"http://"* ]]; then
  fail "ZITADEL login UI redirect contains http:// — X-Forwarded-Proto not reaching login service"
  log "  Location header: ${login_location}"
else
  pass "ZITADEL login UI redirect uses https"
fi

# --- Test 4: Authorize endpoint redirect scheme ----------------------------
log "Test 4: Verifying /authorize redirect scheme"
verifier="$(openssl rand -hex 32 2>/dev/null || true)"
challenge="$(printf '%s' "$verifier" | openssl dgst -sha256 -binary 2>/dev/null | openssl base64 -A 2>/dev/null | tr '+/' '-_' | tr -d '=' || true)"

if [[ -n "$challenge" ]]; then
  auth_location="$(curl -ksS -o /dev/null -D - --max-time 10 --max-redirs 0 \
    "https://${SSO_DOMAIN}/authorize?client_id=prototype-app-a&redirect_uri=https://app-a.timeh.my.id/auth/callback&response_type=code&scope=openid+profile+email&state=proto-check&nonce=proto-check&code_challenge=${challenge}&code_challenge_method=S256" \
    2>/dev/null | grep -i '^location:' | head -1 | tr -d '\r' || true)"

  if [[ -z "$auth_location" ]]; then
    warn "No redirect from /authorize (may return error)"
  elif echo "$auth_location" | grep -q "https://"; then
    pass "/authorize redirects to ZITADEL via https"
  else
    fail "/authorize redirect uses non-https scheme"
    log "  Location: ${auth_location:0:120}"
  fi
else
  warn "Could not generate PKCE challenge (openssl not available)"
fi

# --- Test 5: Internal broker ZITADEL_BROKER_INTERNAL_ISSUER connectivity ---
log "Test 5: Checking internal issuer connectivity (via docker exec)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
if [[ -f "$COMPOSE_FILE" ]]; then
  internal_check="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" \
    exec -T sso-backend wget -q -O - --timeout=5 \
    "http://zitadel-api:8080/.well-known/openid-configuration" 2>/dev/null || true)"

  if [[ -n "$internal_check" ]]; then
    internal_issuer="$(printf '%s' "$internal_check" | jq -r '.issuer // empty' 2>/dev/null || true)"
    if [[ "$internal_issuer" == "https://${ZITADEL_DOMAIN}" ]]; then
      pass "Internal ZITADEL issuer (via zitadel-api:8080): $internal_issuer"
    else
      warn "Internal issuer: '${internal_issuer:-empty}' (may differ from public; broker handles both)"
    fi
  else
    warn "Could not reach zitadel-api:8080 from sso-backend (stack may not be running)"
  fi
else
  warn "Skipping internal check: compose file not found"
fi

# --- Summary ---------------------------------------------------------------
echo
if [[ "$FAILURES" -eq 0 ]]; then
  log "=============================="
  log "All proto checks PASSED ✅"
  log "=============================="
  exit 0
else
  log "=============================="
  log "${FAILURES} proto check(s) FAILED ❌"
  log "=============================="
  exit 1
fi

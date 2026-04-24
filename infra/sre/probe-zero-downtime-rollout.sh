#!/usr/bin/env bash
set -euo pipefail

PHASE="${PHASE:-phase1}"
BASE_URL="${BASE_URL:-https://dev-sso.timeh.my.id}"
IDP_URL="${IDP_URL:-https://id.dev-sso.timeh.my.id}"
APP_A_URL="${APP_A_URL:-https://app-a.timeh.my.id}"
APP_B_URL="${APP_B_URL:-https://app-b.timeh.my.id}"
APP_CALLBACK_URL="${APP_CALLBACK_URL:-https://app-a.timeh.my.id/auth/callback}"

location_header() {
  curl -skS -D - -o /dev/null "$1" | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r'
}

assert_contains() {
  local actual="$1"
  local expected="$2"
  local label="$3"

  if [[ "$actual" != *"$expected"* ]]; then
    printf '[probe-zero-downtime-rollout][ERROR] %s missing expected fragment: %s\n' "$label" "$expected" >&2
    exit 1
  fi
}

phase1_probe() {
  local url location

  url="${BASE_URL}/sso/authorize?client_id=prototype-app-a&redirect_uri=${APP_CALLBACK_URL}&response_type=code&scope=openid%20profile%20email&state=phase1-check&nonce=phase1-check&code_challenge=phase1-check&code_challenge_method=S256"
  location="$(location_header "$url")"

  assert_contains "$location" "${IDP_URL}/oauth/v2/authorize" "phase1 broker canary redirect"
  assert_contains "$location" "redirect_uri=https%3A%2F%2Fdev-sso.timeh.my.id%2Fcallbacks%2Fzitadel" "phase1 broker callback"
}

phase2_probe() {
  local app_a_location app_b_location

  app_a_location="$(location_header "${APP_A_URL}/auth/login")"
  app_b_location="$(location_header "${APP_B_URL}/auth/login")"

  assert_contains "$app_a_location" "${BASE_URL}/authorize" "phase2 app-a login redirect"
  assert_contains "$app_b_location" "${BASE_URL}/authorize" "phase2 app-b login redirect"
}

main() {
  case "$PHASE" in
    phase1)
      phase1_probe
      ;;
    phase2)
      phase2_probe
      ;;
    *)
      printf '[probe-zero-downtime-rollout][ERROR] PHASE must be phase1 or phase2\n' >&2
      exit 1
      ;;
  esac

  printf '[probe-zero-downtime-rollout] OK (%s)\n' "$PHASE"
}

main

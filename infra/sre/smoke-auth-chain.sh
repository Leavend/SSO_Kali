#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://dev-sso.timeh.my.id}"
IDP_URL="${IDP_URL:-https://id.dev-sso.timeh.my.id}"
CLIENT_ID="${CLIENT_ID:-prototype-app-a}"
CALLBACK_URL="${CALLBACK_URL:-https://app-a.timeh.my.id/auth/callback}"
BROKER_CALLBACK_URL="${BASE_URL}/callbacks/zitadel"
ENCODED_BROKER_CALLBACK_URL="${BROKER_CALLBACK_URL//:/%3A}"
ENCODED_BROKER_CALLBACK_URL="${ENCODED_BROKER_CALLBACK_URL//\//%2F}"

authorize_url="${BASE_URL}/authorize?client_id=${CLIENT_ID}&redirect_uri=${CALLBACK_URL}&response_type=code&scope=openid%20profile%20email&state=probe-state&nonce=probe-nonce&code_challenge=probe-challenge&code_challenge_method=S256"

location_header() {
  curl -skS -D - -o /dev/null "$1" | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r'
}

issuer() {
  curl -skfsS "$1/.well-known/openid-configuration" | python3 -c 'import json, sys; print(json.load(sys.stdin)["issuer"])'
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  local label="$3"

  if [[ "$actual" != "$expected" ]]; then
    printf '[smoke-auth-chain][ERROR] %s mismatch: expected=%s actual=%s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

assert_contains() {
  local actual="$1"
  local expected="$2"
  local label="$3"

  if [[ "$actual" != *"$expected"* ]]; then
    printf '[smoke-auth-chain][ERROR] %s missing expected fragment: %s\n' "$label" "$expected" >&2
    exit 1
  fi
}

assert_equals "$(issuer "$BASE_URL")" "$BASE_URL" "broker issuer"
assert_equals "$(issuer "$IDP_URL")" "$IDP_URL" "idp issuer"

first_hop="$(location_header "$authorize_url")"
assert_contains "$first_hop" "${IDP_URL}/oauth/v2/authorize" "authorize redirect"
assert_contains "$first_hop" "redirect_uri=${ENCODED_BROKER_CALLBACK_URL}" "upstream callback"

printf '[smoke-auth-chain] OK\n'

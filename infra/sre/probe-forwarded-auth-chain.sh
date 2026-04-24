#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://dev-sso.timeh.my.id}"
IDP_URL="${IDP_URL:-https://id.dev-sso.timeh.my.id}"
CLIENT_ID="${CLIENT_ID:-prototype-app-a}"
CALLBACK_URL="${CALLBACK_URL:-https://app-a.timeh.my.id/auth/callback}"
BROKER_CALLBACK_URL="${BASE_URL}/callbacks/zitadel"
ENCODED_BROKER_CALLBACK_URL="${BROKER_CALLBACK_URL//:/%3A}"
ENCODED_BROKER_CALLBACK_URL="${ENCODED_BROKER_CALLBACK_URL//\//%2F}"

authorize_url="${BASE_URL}/authorize?client_id=${CLIENT_ID}&redirect_uri=${CALLBACK_URL}&response_type=code&scope=openid%20profile%20email&state=forwarded-probe-state&nonce=forwarded-probe-nonce&code_challenge=forwarded-probe-challenge&code_challenge_method=S256"

compact_document() {
  curl -skfsS "$1/.well-known/openid-configuration" | tr -d '\n\r\t ' | sed 's#\\/#/#g'
}

location_header() {
  curl -skS -D - -o /dev/null "$1" | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r'
}

normalize_location() {
  local base="$1"
  local location="$2"

  if [[ "$location" == http://* || "$location" == https://* ]]; then
    printf '%s' "$location"
    return
  fi

  printf '%s%s' "$base" "$location"
}

assert_not_empty() {
  local actual="$1"
  local label="$2"

  if [[ -z "$actual" ]]; then
    printf '[probe-forwarded-auth-chain][ERROR] %s returned an empty Location header\n' "$label" >&2
    exit 1
  fi
}

assert_contains() {
  local actual="$1"
  local expected="$2"
  local label="$3"

  if [[ "$actual" != *"$expected"* ]]; then
    printf '[probe-forwarded-auth-chain][ERROR] %s missing expected fragment: %s\n' "$label" "$expected" >&2
    exit 1
  fi
}

broker_document="$(compact_document "$BASE_URL")"
idp_document="$(compact_document "$IDP_URL")"
first_hop="$(location_header "$authorize_url")"

assert_not_empty "$first_hop" "broker authorize hop"

second_hop_raw="$(location_header "$first_hop")"

assert_not_empty "$second_hop_raw" "idp authorize hop"

second_hop="$(normalize_location "$IDP_URL" "$second_hop_raw")"

assert_contains "$broker_document" "\"issuer\":\"${BASE_URL}\"" "broker issuer"
assert_contains "$broker_document" "\"authorization_endpoint\":\"${BASE_URL}/authorize\"" "broker authorization endpoint"
assert_contains "$broker_document" "\"token_endpoint\":\"${BASE_URL}/token\"" "broker token endpoint"
assert_contains "$broker_document" "\"jwks_uri\":\"${BASE_URL}/jwks\"" "broker jwks"
assert_contains "$idp_document" "\"issuer\":\"${IDP_URL}\"" "idp issuer"
assert_contains "$first_hop" "${IDP_URL}/oauth/v2/authorize" "first hop redirect host"
assert_contains "$first_hop" "redirect_uri=${ENCODED_BROKER_CALLBACK_URL}" "upstream callback redirect"
assert_contains "$second_hop" "${IDP_URL}/ui/v2/login/" "second hop login ui host"

printf '[probe-forwarded-auth-chain] OK\n'

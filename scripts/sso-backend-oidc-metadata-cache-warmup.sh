#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${BASE_URL:-https://api-sso.timeh.my.id}"
ROUNDS="${ROUNDS:-10}"
PARALLEL="${PARALLEL:-20}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

paths=(
  "/.well-known/openid-configuration"
  "/.well-known/jwks.json"
  "/jwks"
)

printf '[warmup] base=%s rounds=%s parallel=%s\n' "$BASE_URL" "$ROUNDS" "$PARALLEL"

for path in "${paths[@]}"; do
  printf '[warmup] path=%s\n' "$path"
  seq 1 "$ROUNDS" | xargs -P "$PARALLEL" -I{} curl -fsS -o /dev/null \
    -H "Accept: application/json" \
    "${BASE_URL}${path}"
done

printf '[warmup] final headers\n'
for path in "${paths[@]}"; do
  printf -- '--- %s\n' "$path"
  curl -fsS -D - -o "$TMP_DIR/$(echo "$path" | tr '/.' '__').json" \
    -H "Accept: application/json" \
    "${BASE_URL}${path}" \
    | awk 'BEGIN{IGNORECASE=1}/^HTTP\/|^cache-control:|^x-edge-cache:|^x-request-id:/{print}'
done

if cmp -s "$TMP_DIR/__well-known_jwks_json.json" "$TMP_DIR/_jwks.json"; then
  printf '[warmup] jwks bodies match\n'
else
  printf '[warmup][WARN] jwks bodies differ\n' >&2
  exit 1
fi

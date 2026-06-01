#!/usr/bin/env bash
set -euo pipefail

ADMIN_URL="${SSO_ADMIN_FRONTEND_URL:-https://admin-sso.timeh.my.id}"
COOKIE_HEADER="${SSO_ADMIN_SMOKE_COOKIE_HEADER:-}"
EXPECTED_EMAIL="${SSO_ADMIN_SMOKE_EXPECTED_EMAIL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-url)
      ADMIN_URL="${2:-}"
      shift 2
      ;;
    --cookie-header)
      COOKIE_HEADER="${2:-}"
      shift 2
      ;;
    --expected-email)
      EXPECTED_EMAIL="${2:-}"
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$COOKIE_HEADER" ]]; then
  echo 'SSO_ADMIN_SMOKE_COOKIE_HEADER is required for authenticated admin smoke.' >&2
  exit 2
fi

headers_file="$(mktemp)"
body_file="$(mktemp)"
trap 'rm -f "$headers_file" "$body_file"' EXIT

status="$(curl -sS --max-time 20 -o "$body_file" -D "$headers_file" -w '%{http_code}' \
  -H 'Accept: application/json' \
  -H "Cookie: ${COOKIE_HEADER}" \
  "${ADMIN_URL%/}/api/admin/me")"

if [[ "$status" != '200' ]]; then
  echo "expected authenticated /api/admin/me to return HTTP 200, got HTTP $status" >&2
  sed -E 's/(set-cookie:|cookie:).*/\1 [redacted]/Ig' "$headers_file" >&2 || true
  head -c 400 "$body_file" >&2 || true
  exit 1
fi

if ! grep -qi '^content-type: application/json' "$headers_file"; then
  echo 'expected authenticated /api/admin/me content-type application/json, got:' >&2
  sed -E 's/(set-cookie:|cookie:).*/\1 [redacted]/Ig' "$headers_file" >&2 || true
  exit 1
fi

if grep -Eiq '<!doctype html|<html' "$body_file"; then
  echo 'expected authenticated /api/admin/me JSON body, got HTML.' >&2
  exit 1
fi

if ! grep -Eq '"role"[[:space:]]*:[[:space:]]*"admin"' "$body_file"; then
  echo 'expected authenticated /api/admin/me principal role=admin.' >&2
  head -c 400 "$body_file" >&2 || true
  exit 1
fi

if ! grep -Eq '"(subject_id|subject)"[[:space:]]*:' "$body_file"; then
  echo 'expected authenticated /api/admin/me principal subject.' >&2
  head -c 400 "$body_file" >&2 || true
  exit 1
fi

if [[ -n "$EXPECTED_EMAIL" ]] && ! grep -Fq "$EXPECTED_EMAIL" "$body_file"; then
  echo 'expected authenticated /api/admin/me principal email did not match configured smoke user.' >&2
  exit 1
fi

echo 'authenticated admin smoke OK: /api/admin/me returned HTTP 200 principal.'

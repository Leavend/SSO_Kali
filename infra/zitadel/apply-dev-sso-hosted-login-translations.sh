#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
BOOTSTRAP_VOLUME="${BOOTSTRAP_VOLUME:-sso-dev-zitadel-bootstrap}"
TRANSLATION_DIR="${TRANSLATION_DIR:-$ROOT_DIR/infra/zitadel/translations}"
EN_FILE="${EN_FILE:-$TRANSLATION_DIR/hosted-login.en.json}"
ID_FILE="${ID_FILE:-$TRANSLATION_DIR/hosted-login.id.json}"

log() {
  printf '[apply-dev-sso-hosted-login-translations] %s\n' "$*"
}

die() {
  printf '[apply-dev-sso-hosted-login-translations][ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

bootstrap_dir() {
  docker volume inspect "$BOOTSTRAP_VOLUME" --format '{{.Mountpoint}}' 2>/dev/null || true
}

load_pat() {
  local dir
  dir="$(bootstrap_dir)"
  [[ -n "$dir" ]] || die "Bootstrap volume not found: $BOOTSTRAP_VOLUME"
  [[ -f "${dir}/admin.pat" ]] || die "Missing admin PAT at ${dir}/admin.pat"
  tr -d '\r\n' <"${dir}/admin.pat"
}

api_request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"
  local tmp_body status
  tmp_body="$(mktemp)"
  local args=(
    -ksS
    -o "$tmp_body"
    -w '%{http_code}'
    -H "Authorization: Bearer ${PAT}"
    -H 'Content-Type: application/json'
    -X "$method"
    "${ZITADEL_BASE_URL}${path}"
  )
  [[ -n "$body" ]] && args+=(-d "$body")
  status="$(curl "${args[@]}")"
  [[ "$status" =~ ^2 ]] || { cat "$tmp_body" >&2; rm -f "$tmp_body"; die "API request failed for ${path} (HTTP ${status})"; }
  cat "$tmp_body"
  rm -f "$tmp_body"
}

load_base_translation() {
  local locale="$1"
  local tmp_body status
  tmp_body="$(mktemp)"
  status="$(curl -ksS -o "$tmp_body" -w '%{http_code}' \
    -H "Authorization: Bearer ${PAT}" \
    "${ZITADEL_BASE_URL}/v2/settings/hosted_login_translation?instance=true&locale=${locale}")"
  if [[ "$status" == "404" ]]; then
    rm -f "$tmp_body"
    printf '{}'
    return 0
  fi
  [[ "$status" =~ ^2 ]] || { cat "$tmp_body" >&2; rm -f "$tmp_body"; die "Could not read hosted login translation for ${locale} (HTTP ${status})"; }
  jq '.translations // {}' "$tmp_body"
  rm -f "$tmp_body"
}

merge_translation() {
  local locale="$1"
  local override_file="$2"
  local base_file merged_file
  base_file="$(mktemp)"
  merged_file="$(mktemp)"
  load_base_translation "$locale" >"$base_file"
  jq -s '.[0] * .[1]' "$base_file" "$override_file" >"$merged_file"
  cat "$merged_file"
  rm -f "$base_file" "$merged_file"
}

apply_translation() {
  local locale="$1"
  local override_file="$2"
  local merged_file payload_file
  merged_file="$(mktemp)"
  payload_file="$(mktemp)"
  merge_translation "$locale" "$override_file" >"$merged_file"
  jq -n \
    --arg locale "$locale" \
    --slurpfile translations "$merged_file" \
    '{instance:true, locale:$locale, translations:$translations[0]}' >"$payload_file"
  log "Applying hosted login translation for ${locale}"
  api_request PUT '/v2/settings/hosted_login_translation' "$(cat "$payload_file")" >/dev/null
  verify_translation "$locale"
  rm -f "$merged_file" "$payload_file"
}

verify_translation() {
  local locale="$1"
  local tmp_body status
  tmp_body="$(mktemp)"
  status="$(curl -ksS -o "$tmp_body" -w '%{http_code}' \
    -H "Authorization: Bearer ${PAT}" \
    "${ZITADEL_BASE_URL}/v2/settings/hosted_login_translation?instance=true&locale=${locale}")"
  if [[ "$status" == "404" ]]; then
    log "Translation lookup for ${locale} is not persisted by this ZITADEL runtime; bundle and edge fallbacks remain authoritative."
    rm -f "$tmp_body"
    return 0
  fi
  [[ "$status" =~ ^2 ]] || { cat "$tmp_body" >&2; rm -f "$tmp_body"; die "Could not verify hosted login translation for ${locale} (HTTP ${status})"; }
  jq '{etag: .etag}' "$tmp_body"
  rm -f "$tmp_body"
}

main() {
  local domain

  require_command curl
  require_command docker
  require_command jq
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  [[ -f "$EN_FILE" ]] || die "Missing translation file: $EN_FILE"
  [[ -f "$ID_FILE" ]] || die "Missing translation file: $ID_FILE"

  PAT="${ZITADEL_PAT:-$(load_pat)}"
  domain="$(get_env ZITADEL_DOMAIN)"
  ZITADEL_BASE_URL="https://${domain}"
  [[ -n "$PAT" ]] || die 'Admin PAT is empty.'
  [[ -n "$domain" ]] || die 'Missing ZITADEL_DOMAIN in env file.'

  apply_translation en "$EN_FILE"
  apply_translation id "$ID_FILE"
}

main "$@"

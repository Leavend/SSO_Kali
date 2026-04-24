#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
BOOTSTRAP_VOLUME="${BOOTSTRAP_VOLUME:-sso-dev-zitadel-bootstrap}"
DEFAULT_LANGUAGE="${DEFAULT_LANGUAGE:-id}"
ALLOWED_LANGUAGES="${ALLOWED_LANGUAGES:-id,en}"

log() {
  printf '[apply-dev-sso-language-policy] %s\n' "$*"
}

die() {
  printf '[apply-dev-sso-language-policy][ERROR] %s\n' "$*" >&2
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

api_put() {
  local path="$1"
  local body="${2:-}"
  local args=(
    -ksSf
    -H "Authorization: Bearer ${PAT}"
    -H 'Content-Type: application/json'
    -X PUT
    "${ZITADEL_BASE_URL}${path}"
  )
  [[ -n "$body" ]] && args+=(-d "$body")
  curl "${args[@]}" >/dev/null
}

api_get() {
  local path="$1"
  curl -ksSf \
    -H "Authorization: Bearer ${PAT}" \
    "${ZITADEL_BASE_URL}${path}"
}

api_get_or_empty() {
  local path="$1"
  api_get "$path" 2>/dev/null || printf '{}'
}

restrictions_payload() {
  jq -n --arg languages "$ALLOWED_LANGUAGES" \
    '{allowedLanguages: {languages: ($languages | split(",") | map(gsub("^\\s+|\\s+$"; "")))}}'
}

main() {
  local domain

  require_command curl
  require_command docker
  require_command jq
  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"

  PAT="${ZITADEL_PAT:-$(load_pat)}"
  domain="$(get_env ZITADEL_DOMAIN)"
  ZITADEL_BASE_URL="https://${domain}"
  [[ -n "$PAT" ]] || die 'Admin PAT is empty.'
  [[ -n "$domain" ]] || die 'Missing ZITADEL_DOMAIN in env file.'

  log "Setting allowed languages to ${ALLOWED_LANGUAGES}"
  api_put '/admin/v1/restrictions' "$(restrictions_payload)"
  log "Setting default language to ${DEFAULT_LANGUAGE}"
  api_put "/admin/v1/languages/default/${DEFAULT_LANGUAGE}"

  jq -n \
    --argjson restrictions "$(api_get_or_empty '/admin/v1/restrictions')" \
    --argjson defaultLanguage "$(api_get_or_empty '/admin/v1/languages/default')" \
    --argjson allowedLanguages "$(api_get_or_empty '/admin/v1/languages/allowed')" \
    '{defaultLanguage:($defaultLanguage.language // null), allowedLanguages:($allowedLanguages.languages // []), restrictions:$restrictions}'
}

main "$@"

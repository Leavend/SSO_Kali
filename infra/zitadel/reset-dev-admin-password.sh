#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.dev}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/docker-compose.dev.yml}"
BOOTSTRAP_VOLUME="${BOOTSTRAP_VOLUME:-sso-dev-zitadel-bootstrap}"
TARGET_USERNAME="${TARGET_USERNAME:-dev@timeh.my.id}"
NEW_PASSWORD="${NEW_PASSWORD:-}"
NEW_PASSWORD_FILE="${NEW_PASSWORD_FILE:-}"
GENERATED_PASSWORD_OUTPUT_FILE="${GENERATED_PASSWORD_OUTPUT_FILE:-}"
RESOLVED_PASSWORD=""
GENERATED_PASSWORD_PATH=""

log() {
  printf '[reset-dev-admin-password] %s\n' "$*"
}

die() {
  printf '[reset-dev-admin-password][ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

get_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key {sub(/^[^=]*=/, "", $0); print $0; exit}' "$ENV_FILE"
}

read_password_from_prompt() {
  local first second

  [[ -t 0 ]] || die "Set NEW_PASSWORD or NEW_PASSWORD_FILE when stdin is not interactive."

  read -rsp "New password for ${TARGET_USERNAME}: " first
  printf '\n'
  read -rsp "Confirm password: " second
  printf '\n'

  [[ -n "$first" ]] || die "Password cannot be empty."
  [[ "$first" == "$second" ]] || die "Password confirmation does not match."

  printf '%s' "$first"
}

generate_password_value() {
  require_command openssl

  local token
  token="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9')"
  token="${token:0:24}"

  [[ "${#token}" -ge 20 ]] || die "Failed to generate a strong password."
  printf '%s!Aa1' "$token"
}

resolve_generated_password_path() {
  if [[ -n "$GENERATED_PASSWORD_OUTPUT_FILE" ]]; then
    printf '%s' "$GENERATED_PASSWORD_OUTPUT_FILE"
    return 0
  fi

  mktemp "${TMPDIR:-/tmp}/dev-admin-password.XXXXXX"
}

write_generated_password_file() {
  local path="$1"
  local password="$2"

  mkdir -p "$(dirname "$path")"
  (umask 077 && printf '%s' "$password" >"$path")
  chmod 600 "$path"
}

generate_password_for_automation() {
  local path

  RESOLVED_PASSWORD="$(generate_password_value)"
  path="$(resolve_generated_password_path)"
  write_generated_password_file "$path" "$RESOLVED_PASSWORD"

  GENERATED_PASSWORD_PATH="$path"
}

resolve_new_password() {
  if [[ -n "$NEW_PASSWORD" ]]; then
    RESOLVED_PASSWORD="$NEW_PASSWORD"
    return 0
  fi

  if [[ -n "$NEW_PASSWORD_FILE" ]]; then
    [[ -f "$NEW_PASSWORD_FILE" ]] || die "Password file not found: $NEW_PASSWORD_FILE"
    RESOLVED_PASSWORD="$(tr -d '\r\n' <"$NEW_PASSWORD_FILE")"
    return 0
  fi

  if [[ -t 0 ]]; then
    RESOLVED_PASSWORD="$(read_password_from_prompt)"
    return 0
  fi

  generate_password_for_automation
}

search_user() {
  local base_url="$1"
  local pat="$2"
  local body

  body="$(jq -n --arg q "$TARGET_USERNAME" '{
    limit: 1,
    queries: [{ userNameQuery: { userName: $q, method: "TEXT_QUERY_METHOD_EQUALS" } }]
  }')"

  curl -ksS \
    -H "Authorization: Bearer ${pat}" \
    -H 'Content-Type: application/json' \
    -X POST "${base_url}/management/v1/users/_search" \
    -d "$body"
}

reset_password() {
  local base_url="$1"
  local pat="$2"
  local user_id="$3"
  local password="$4"
  local body

  body="$(jq -n --arg password "$password" '{password: $password, noChangeRequired: true}')"

  curl -ksS \
    -H "Authorization: Bearer ${pat}" \
    -H 'Content-Type: application/json' \
    -X POST "${base_url}/management/v1/users/${user_id}/password" \
    -d "$body" >/dev/null
}

main() {
  local bootstrap_dir pat base_url user_json user_id password

  require_command curl
  require_command docker
  require_command jq

  [[ -f "$ENV_FILE" ]] || die "Missing env file: $ENV_FILE"
  [[ -f "$COMPOSE_FILE" ]] || die "Missing compose file: $COMPOSE_FILE"

  bootstrap_dir="$(docker volume inspect "$BOOTSTRAP_VOLUME" --format '{{.Mountpoint}}' 2>/dev/null || true)"
  [[ -n "$bootstrap_dir" ]] || die "Bootstrap volume not found: $BOOTSTRAP_VOLUME"
  [[ -f "${bootstrap_dir}/admin.pat" ]] || die "Missing admin PAT at ${bootstrap_dir}/admin.pat"

  pat="$(tr -d '\r\n' <"${bootstrap_dir}/admin.pat")"
  [[ -n "$pat" ]] || die "Admin PAT is empty."

  base_url="https://$(get_env ZITADEL_DOMAIN)"
  [[ -n "$base_url" ]] || die "Missing ZITADEL_DOMAIN in $ENV_FILE"

  user_json="$(search_user "$base_url" "$pat")"
  user_id="$(printf '%s' "$user_json" | jq -r '.result[0].id // empty')"
  [[ -n "$user_id" ]] || die "User not found: $TARGET_USERNAME"

  resolve_new_password
  password="$RESOLVED_PASSWORD"
  [[ -n "$password" ]] || die "Password cannot be empty."
  reset_password "$base_url" "$pat" "$user_id" "$password"

  log "Password rotated successfully for ${TARGET_USERNAME}."
  log "No password value was written to logs or repo files."

  if [[ -n "$GENERATED_PASSWORD_PATH" ]]; then
    log "Generated password written to ${GENERATED_PASSWORD_PATH}."
    log "Delete that file after successful login verification."
  fi
}

main "$@"

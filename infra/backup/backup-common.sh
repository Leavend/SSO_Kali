#!/usr/bin/env bash

backup_repo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

backup_source_env_file() {
  local env_file="$1"

  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

backup_require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[backup][ERROR] missing required command: $command_name" >&2
    exit 1
  fi
}

backup_sha256_file() {
  local target_file="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$target_file" | awk '{print $1}'
    return
  fi

  shasum -a 256 "$target_file" | awk '{print $1}'
}

backup_timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

backup_epoch() {
  date -u +%s
}

backup_compose() {
  docker compose --env-file "$BACKUP_ENV_FILE" -f "$BACKUP_COMPOSE_FILE" "$@"
}

backup_value_from_file() {
  local file_path="$1"
  local key="$2"
  local default_value="$3"
  local value

  if [[ ! -f "$file_path" ]]; then
    printf '%s' "$default_value"
    return
  fi

  value="$(grep -E "^${key}=" "$file_path" | tail -n1 || true)"

  if [[ -z "$value" ]]; then
    printf '%s' "$default_value"
    return
  fi

  printf '%s' "${value#*=}"
}

backup_sanitize_key() {
  printf '%s' "$1" | tr '[:lower:]-.' '[:upper:]__'
}


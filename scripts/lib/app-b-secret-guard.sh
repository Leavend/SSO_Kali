#!/usr/bin/env bash
# Shared App B confidential-client guard for VPS deploy paths.

app_b_guard_fail() {
  if declare -F fail >/dev/null 2>&1; then
    fail "$1"
  fi

  printf 'ERROR: %s\n' "$1" >&2
  exit 1
}

app_b_env_value() {
  local key="$1"
  awk -v key="$key" '
    /^[[:space:]]*#/ || $0 !~ /=/ { next }
    {
      candidate = $0
      sub(/=.*/, "", candidate)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", candidate)
      if (candidate == key) {
        sub(/^[^=]*=/, "", $0)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $0)
        gsub(/^'\''|'\''$/, "", $0)
        gsub(/^"|"$/, "", $0)
        print $0
        exit
      }
    }
  ' "$ENV_FILE"
}

app_b_require_single_quoted_argon_hash() {
  local key="$1" line value
  line="$(grep -E "^${key}=" "$ENV_FILE" || true)"
  [[ -n "$line" ]] || app_b_guard_fail "${key} must be set"

  value="${line#*=}"
  case "$value" in
    "'\$argon2id\$"*) return 0 ;;
    \$argon2id\$*) app_b_guard_fail "${key} must be single-quoted in ${ENV_FILE} to prevent Compose dollar interpolation" ;;
    *) app_b_guard_fail "${key} must contain a single-quoted Argon2id hash" ;;
  esac
}

app_b_verify_hash() {
  local secret="$1" hash="$2"
  printf '%s\n%s' "$secret" "$hash" \
    | docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T sso-backend \
      php -r '$s=rtrim(fgets(STDIN));$h=rtrim(stream_get_contents(STDIN));exit(password_verify($s,$h)?0:1);'
}

app_b_require_secret_hash_match() {
  local secret hash purpose="${1:-deploy}"
  secret="$(app_b_env_value APP_B_CLIENT_SECRET)"
  hash="$(app_b_env_value APP_B_CLIENT_SECRET_HASH)"
  [[ -n "$secret" ]] || app_b_guard_fail "APP_B_CLIENT_SECRET must be set"
  [[ -n "$hash" ]] || app_b_guard_fail "APP_B_CLIENT_SECRET_HASH must be set"
  app_b_verify_hash "$secret" "$hash" \
    || app_b_guard_fail "APP_B_CLIENT_SECRET_HASH must verify APP_B_CLIENT_SECRET before ${purpose}"
}

app_b_require_confidential_client_ready() {
  local purpose="${1:-deploy}"
  app_b_require_single_quoted_argon_hash "APP_B_CLIENT_SECRET_HASH"
  app_b_require_secret_hash_match "$purpose"
}

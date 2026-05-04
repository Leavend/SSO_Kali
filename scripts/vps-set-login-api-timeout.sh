#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
TIMEOUT_MS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --timeout-ms) TIMEOUT_MS="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"
BACKUP_FILE="$PROJECT_DIR/.env.dev.pre-login-timeout-$(date -u +%Y%m%d%H%M%S)"

log() { printf '\n[login-timeout] %s\n' "$*"; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

require_runtime() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "Missing Compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }
  [[ "$TIMEOUT_MS" =~ ^[1-9][0-9]*$ ]] || { echo "--timeout-ms must be a positive integer" >&2; exit 2; }
  if (( TIMEOUT_MS < 6000 || TIMEOUT_MS > 30000 )); then
    echo "--timeout-ms must be between 6000 and 30000" >&2
    exit 2
  fi
}

set_env_value() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" '
    BEGIN { done = 0 }
    $0 ~ "^" key "=" {
      print key "=" value
      done = 1
      next
    }
    { print }
    END {
      if (!done) print key "=" value
    }
  ' "$ENV_FILE" > "$tmp"
  install -m 0640 "$tmp" "$ENV_FILE"
  rm -f "$tmp"
}

wait_healthy() {
  local service="$1" timeout="${2:-120}" elapsed=0 container_id status
  while (( elapsed < timeout )); do
    container_id="$(compose ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$container_id" ]]; then
      status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || echo unknown)"
      case "$status" in
        healthy|running)
          echo "service=$service health=$status"
          return 0
          ;;
        unhealthy|exited|dead)
          echo "service=$service health=$status" >&2
          docker logs --tail 40 "$container_id" 2>&1 || true
          return 1
          ;;
      esac
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "service=$service health=timeout" >&2
  return 1
}

probe_login() {
  local zitadel_domain
  zitadel_domain="$(awk -F= '$1 == "ZITADEL_DOMAIN" {print substr($0, length($1) + 2)}' "$ENV_FILE" | tail -n 1)"
  curl -ksS -H "Host: ${zitadel_domain}" -o /dev/null \
    -w "vue_login_health %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" \
    --connect-timeout 3 --max-time 15 "http://127.0.0.1:18080/ui/v2/auth/healthz"
  curl -ksS -H "Host: ${zitadel_domain}" -o /dev/null \
    -w "vue_login_page %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" \
    --connect-timeout 3 --max-time 15 "http://127.0.0.1:18080/ui/v2/auth/login"
}

require_runtime

log "Backup env"
cp "$ENV_FILE" "$BACKUP_FILE"
chmod 0640 "$BACKUP_FILE"
echo "backup=$BACKUP_FILE"

log "Apply ZITADEL_LOGIN_API_TIMEOUT_MS=$TIMEOUT_MS"
set_env_value ZITADEL_LOGIN_API_TIMEOUT_MS "$TIMEOUT_MS"

log "Recreate zitadel-login-vue"
compose up -d --no-deps zitadel-login-vue
wait_healthy zitadel-login-vue 120

log "Smoke"
probe_login

log "Rollback"
echo "sudo install -m 0640 '$BACKUP_FILE' '$ENV_FILE' && sudo docker compose --env-file '$ENV_FILE' -f '$COMPOSE_FILE' up -d --no-deps zitadel-login-vue"

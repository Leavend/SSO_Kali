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

service_image() {
  compose config | awk '
    /^[[:space:]]{2}zitadel-login-vue:/ { in_service = 1; next }
    in_service && /^[[:space:]]{2}[[:alnum:]_-]+:/ { exit }
    in_service && /^[[:space:]]{4}image:/ { print $2; exit }
  '
}

preserve_running_image_tag() {
  local image_ref container_id image_id
  image_ref="$(service_image)"
  [[ -n "$image_ref" ]] || { echo "Unable to resolve zitadel-login-vue image reference" >&2; exit 1; }
  docker image inspect "$image_ref" >/dev/null 2>&1 && return 0

  container_id="$(compose ps -q zitadel-login-vue 2>/dev/null || true)"
  [[ -n "$container_id" ]] || { echo "Missing running zitadel-login-vue container and image tag: $image_ref" >&2; exit 1; }

  image_id="$(docker inspect --format '{{.Image}}' "$container_id")"
  [[ -n "$image_id" ]] || { echo "Unable to inspect running zitadel-login-vue image" >&2; exit 1; }

  log "Retag running image for no-build recreate"
  docker tag "$image_id" "$image_ref"
  echo "image_ref=$image_ref image_id=$image_id"
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
  [[ -n "$zitadel_domain" ]] || { echo "Missing ZITADEL_DOMAIN in $ENV_FILE" >&2; exit 1; }
  probe_path "vue_login_health" "$zitadel_domain" "/ui/v2/auth/healthz"
  probe_path "vue_login_page" "$zitadel_domain" "/ui/v2/auth/login"
}

probe_path() {
  local label="$1" host="$2" path="$3" attempt result code
  for attempt in $(seq 1 20); do
    result="$(curl -ksS -H "Host: ${host}" -o /dev/null \
      -w "%{http_code} ttfb=%{time_starttransfer} total=%{time_total}" \
      --connect-timeout 3 --max-time 15 "http://127.0.0.1:18080${path}" || true)"
    code="${result%% *}"
    echo "${label} attempt=${attempt} ${result}"
    [[ "$code" =~ ^2 ]] && return 0
    sleep 3
  done
  echo "${label} did not become ready through local reverse proxy" >&2
  return 1
}

require_runtime

log "Backup env"
cp "$ENV_FILE" "$BACKUP_FILE"
chmod 0640 "$BACKUP_FILE"
echo "backup=$BACKUP_FILE"

log "Apply ZITADEL_LOGIN_API_TIMEOUT_MS=$TIMEOUT_MS"
set_env_value ZITADEL_LOGIN_API_TIMEOUT_MS "$TIMEOUT_MS"

log "Recreate zitadel-login-vue"
preserve_running_image_tag
compose up -d --no-deps --no-build --pull never zitadel-login-vue
wait_healthy zitadel-login-vue 120

log "Smoke"
probe_login

log "Rollback"
echo "sudo install -m 0640 '$BACKUP_FILE' '$ENV_FILE' && sudo docker compose --env-file '$ENV_FILE' -f '$COMPOSE_FILE' up -d --no-deps zitadel-login-vue"

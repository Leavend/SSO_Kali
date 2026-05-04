#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
SINCE="30m"
SAMPLES=3

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --since) SINCE="$2"; shift ;;
    --samples) SAMPLES="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"

log() { printf '\n[login-flow-logs] %s\n' "$*"; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() { awk -F= -v key="$1" '$1 == key {print substr($0, length(key) + 2)}' "$ENV_FILE" | tail -n 1; }
redact_sensitive() {
  sed -E \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g' \
    -e 's/(authorization|cookie|password|secret|session|token)([=:][^[:space:]]*)/\1=[redacted]/Ig' \
    -e 's/(Bearer )[A-Za-z0-9._~+\/=-]+/\1[redacted]/Ig'
}

require_runtime() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "Missing Compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }
  [[ "$SINCE" =~ ^[0-9]+(s|m|h)$ ]] || { echo "--since must look like 30m, 2h, or 90s" >&2; exit 2; }
  [[ "$SAMPLES" =~ ^[1-9][0-9]*$ ]] || { echo "--samples must be positive" >&2; exit 2; }
}

service_container_id() {
  compose ps -q "$1" 2>/dev/null || true
}

print_host_pressure() {
  log "Host pressure"
  hostname
  uptime
  free -m || true
  df -h / || true
  ps -eo pid,ppid,comm,%cpu,%mem --sort=-%cpu | head -20 || true
}

print_container_states() {
  log "Identity container states"
  local service container_id
  for service in proxy postgres redis zitadel-api zitadel-login zitadel-login-vue sso-backend sso-backend-worker sso-frontend app-a-next app-b-laravel; do
    container_id="$(service_container_id "$service")"
    if [[ -z "$container_id" ]]; then
      echo "service=$service status=missing"
      continue
    fi
    docker inspect --format \
      "service=$service name={{.Name}} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}} started={{.State.StartedAt}}" \
      "$container_id" || true
  done
}

print_container_pressure() {
  log "Container CPU samples"
  local sample
  for sample in $(seq 1 "$SAMPLES"); do
    echo "-- sample ${sample}/${SAMPLES}"
    docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' \
      | grep -E 'NAME|sso-prototype-dev-(postgres|proxy|redis|zitadel|sso-backend|sso-frontend|app-a-next|app-b-laravel)' || true
    sleep 2
  done
}

print_login_runtime_config() {
  log "Vue login runtime config"
  compose exec -T zitadel-login-vue sh -lc '
    for key in NODE_ENV PUBLIC_BASE_PATH ZITADEL_API_URL ZITADEL_PUBLIC_HOST ZITADEL_INSTANCE_HOST ZITADEL_API_TIMEOUT_MS LOGIN_REQUIRE_TOTP_AFTER_PASSWORD SECURE_COOKIES; do
      value="$(printenv "$key" || true)"
      printf "%s=%s\n" "$key" "${value:-<unset>}"
    done
  ' | redact_sensitive || true
}

print_service_logs() {
  local service="$1"
  log "Recent ${service} logs"
  compose logs --since "$SINCE" --tail 500 "$service" 2>&1 \
    | redact_sensitive \
    | grep -Ei 'api/session|session/password|session/user|/v2/sessions|/v2/users|auth_requests|error|warn|timeout|deadline|context canceled|unavailable|unable to filter events|503|502|504|500|401|403|rate|retry|panic|slow|database|postgres|redis|wrongpass' \
    | tail -160 || true
}

probe_proxy() {
  local host="$1" path="$2" attempt
  for attempt in $(seq 1 "$SAMPLES"); do
    curl -ksS -H "Host: ${host}" -o /dev/null \
      -w "${host}${path} %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" \
      --connect-timeout 3 --max-time 15 "http://127.0.0.1:18080${path}" || true
  done
}

probe_identity_path() {
  log "Safe identity probes"
  local zitadel_domain sso_domain
  zitadel_domain="$(env_value ZITADEL_DOMAIN)"
  sso_domain="$(env_value SSO_DOMAIN)"
  probe_proxy "$zitadel_domain" "/ui/v2/auth/healthz"
  probe_proxy "$zitadel_domain" "/ui/v2/auth/login"
  probe_proxy "$sso_domain" "/.well-known/openid-configuration"
  compose exec -T zitadel-api sh -lc \
    'curl -fsS -o /dev/null -w "zitadel_debug_ready %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" --max-time 8 http://127.0.0.1:8080/debug/ready || true'
}

print_postgres_pressure() {
  log "PostgreSQL waits and active statements"
  compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select state, count(*) from pg_stat_activity group by state order by state;"' || true
  compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select wait_event_type, wait_event, count(*) from pg_stat_activity where wait_event is not null group by wait_event_type, wait_event order by count(*) desc limit 10;"' || true
  compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select now() - query_start as age, state, wait_event_type, left(query, 180) as query from pg_stat_activity where state <> '\''idle'\'' order by query_start nulls last limit 15;"' \
    | redact_sensitive || true
}

require_runtime
print_host_pressure
print_container_states
print_container_pressure
print_login_runtime_config
probe_identity_path
print_service_logs zitadel-login-vue
print_service_logs zitadel-api
print_service_logs proxy
print_service_logs postgres
print_service_logs redis
print_service_logs sso-backend
print_service_logs sso-backend-worker
print_postgres_pressure
log "Complete"

#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
SAMPLES=5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --samples) SAMPLES="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"

log() { printf '\n[diagnose-sso] %s\n' "$*"; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }
env_value() { awk -F= -v key="$1" '$1 == key {print substr($0, length(key) + 2)}' "$ENV_FILE" | tail -n 1; }
redact_sensitive() {
  sed -E \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g' \
    -e 's/(authorization|cookie|password|secret|session|token)([=:][^[:space:]]*)/\1=[redacted]/Ig'
}

require_runtime() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "Missing Compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }
  [[ "$SAMPLES" =~ ^[1-9][0-9]*$ ]] || { echo "--samples must be positive" >&2; exit 1; }
}

print_host() {
  log "Host"
  hostname
  uptime
  free -m || true
  df -h / || true
}

print_containers() {
  log "Compose services"
  compose ps
  log "Container resource snapshot"
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' || true
}

probe_internal() {
  log "Internal identity probes"
  local zitadel_domain sso_domain
  zitadel_domain="$(env_value ZITADEL_DOMAIN)"
  sso_domain="$(env_value SSO_DOMAIN)"
  probe_proxy "$zitadel_domain" "/ui/v2/auth/login"
  probe_proxy "$zitadel_domain" "/ui/v2/auth/healthz"
  probe_proxy "$sso_domain" "/.well-known/openid-configuration"
}

probe_proxy() {
  local host="$1" path="$2" attempt
  for attempt in $(seq 1 "$SAMPLES"); do
    curl -ksS -H "Host: ${host}" -o /dev/null \
      -w "${host}${path} %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" \
      --connect-timeout 3 --max-time 15 "http://127.0.0.1:18080${path}" || true
  done
}

probe_postgres() {
  log "PostgreSQL activity"
  compose exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  compose exec -T postgres sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select state, count(*) from pg_stat_activity group by state order by state;"' || true
  compose exec -T postgres sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select wait_event_type, wait_event, count(*) from pg_stat_activity where wait_event is not null group by wait_event_type, wait_event order by count(*) desc limit 10;"' || true
  compose exec -T postgres sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select locktype, mode, granted, count(*) from pg_locks group by locktype, mode, granted order by count(*) desc limit 15;"' || true
}

probe_zitadel() {
  log "ZITADEL readiness"
  compose exec -T zitadel-api sh -lc \
    'curl -fsS -o /dev/null -w "debug_ready %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" --max-time 8 http://127.0.0.1:8080/debug/ready || true'
  compose exec -T zitadel-api sh -lc \
    'curl -fsS -o /dev/null -w "discovery %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" --max-time 8 http://127.0.0.1:8080/.well-known/openid-configuration || true'
  compose exec -T zitadel-api sh -lc \
    'curl -fsS --max-time 8 http://127.0.0.1:8080/debug/metrics | grep -E "^(process_|go_|http_|grpc_)" | head -80 || true' | redact_sensitive
}

audit_zitadel_container() {
  log "ZITADEL container audit"
  local container_id
  container_id="$(compose ps -q zitadel-api || true)"
  if [[ -z "$container_id" ]]; then
    echo "zitadel-api container not found"
    return
  fi

  docker inspect --format \
    'name={{.Name}} image={{.Config.Image}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} restarts={{.RestartCount}} started={{.State.StartedAt}}' \
    "$container_id" || true

  docker inspect --format \
    'cpus={{.HostConfig.NanoCpus}} memory={{.HostConfig.Memory}} restart={{.HostConfig.RestartPolicy.Name}} networks={{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' \
    "$container_id" || true

  log "ZITADEL recent warnings/errors"
  docker logs --since 30m --tail 300 "$container_id" 2>&1 \
    | redact_sensitive \
    | grep -Ei 'error|warn|timeout|deadline|unavailable|database|postgres|panic|slow|retry|throttle' \
    | tail -80 || true
}

require_runtime
print_host
print_containers
probe_internal
audit_zitadel_container
probe_zitadel
probe_postgres
log "Diagnostic complete"

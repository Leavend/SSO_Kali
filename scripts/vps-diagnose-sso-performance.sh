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
}

probe_zitadel() {
  log "ZITADEL readiness"
  compose exec -T zitadel-api sh -lc \
    'curl -fsS -o /dev/null -w "debug_ready %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" --max-time 8 http://127.0.0.1:8080/debug/ready || true'
  compose exec -T zitadel-api sh -lc \
    'curl -fsS -o /dev/null -w "discovery %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" --max-time 8 http://127.0.0.1:8080/.well-known/openid-configuration || true'
}

require_runtime
print_host
print_containers
probe_internal
probe_zitadel
probe_postgres
log "Diagnostic complete"

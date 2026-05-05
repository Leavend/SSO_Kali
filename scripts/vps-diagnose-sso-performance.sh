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

print_host_processes() {
  log "Host top CPU processes"
  ps -eo pid,ppid,comm,%cpu,%mem --sort=-%cpu | head -25 || true
}

print_containers() {
  log "Compose services"
  compose ps
  log "Container resource snapshot"
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' || true
}

print_focused_container_samples() {
  log "Focused SSO container samples"
  local sample
  for sample in $(seq 1 "$SAMPLES"); do
    echo "-- sample ${sample}/${SAMPLES}"
    docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' \
      | grep -E 'NAME|sso-prototype-dev-(postgres|proxy|redis|zitadel|sso-backend|sso-frontend|sso-admin-vue|app-a-next|app-b-laravel)' || true
    sleep 2
  done
}

audit_resource_policy() {
  log "Runtime resource policy"
  local service container_id
  for service in proxy postgres redis zitadel-api zitadel-login zitadel-login-vue sso-backend sso-backend-worker sso-frontend sso-admin-vue app-a-next app-b-laravel; do
    container_id="$(compose ps -q "$service" || true)"
    if [[ -z "$container_id" ]]; then
      echo "service=${service} status=missing"
      continue
    fi

    docker inspect --format \
      "service=${service} cpus={{.HostConfig.NanoCpus}} cpu_shares={{.HostConfig.CpuShares}} memory={{.HostConfig.Memory}} restart={{.HostConfig.RestartPolicy.Name}}" \
      "$container_id" || true
  done
}

audit_proxy_pressure() {
  log "Proxy recent pressure"
  compose logs --since 15m --tail 300 proxy 2>&1 \
    | redact_sensitive \
    | grep -Ei 'error|warn|timeout|deadline|unavailable|bad gateway|gateway|retry|throttle|rate|slow' \
    | tail -100 || true
}

audit_redis_pressure() {
  log "Redis pressure"
  local redis_password
  redis_password="$(env_value REDIS_PASSWORD)"
  if [[ -z "$redis_password" ]]; then
    echo "redis_auth=missing_env"
    return
  fi

  compose exec -T -e REDISCLI_AUTH="$redis_password" redis redis-cli INFO stats \
    | grep -E "^(total_commands_processed|instantaneous_ops_per_sec|total_net_input_bytes|total_net_output_bytes|rejected_connections|expired_keys|evicted_keys):" || true
  compose exec -T -e REDISCLI_AUTH="$redis_password" redis redis-cli INFO commandstats \
    | grep "^cmdstat_" | sort -t= -k2 -Vr | head -30 || true
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

pg_query() {
  local title="$1" sql="$2"
  echo "-- ${title}"
  compose exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "$1"' sh "$sql" || true
}

probe_postgres() {
  log "PostgreSQL activity"
  compose exec -T postgres sh -lc 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
  pg_query "connection states" "select state, count(*) from pg_stat_activity group by state order by state;"
  pg_query "wait events" "select wait_event_type, wait_event, count(*) from pg_stat_activity where wait_event is not null group by wait_event_type, wait_event order by count(*) desc limit 10;"
  pg_query "locks" "select locktype, mode, granted, count(*) from pg_locks group by locktype, mode, granted order by count(*) desc limit 15;"
  pg_query "database stats" "select datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit, tup_returned, tup_fetched from pg_stat_database order by numbackends desc limit 10;"
  pg_query "active statements" "select now() - query_start as age, state, wait_event_type, left(query, 160) as query from pg_stat_activity where state <> 'idle' order by query_start nulls last limit 10;"
  echo "-- pg_stat_statements hot queries"
  compose exec -T postgres sh -lc '
    if psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select 1 from pg_extension where extname = '\''pg_stat_statements'\''" | grep -qx 1; then
      psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select calls, round(total_exec_time::numeric, 2) as total_ms, round(mean_exec_time::numeric, 2) as mean_ms, left(query, 160) as query from pg_stat_statements order by total_exec_time desc limit 10;"
    else
      echo "pg_stat_statements unavailable: enable it to rank hot SQL by total_exec_time"
    fi
  ' || true
}

probe_zitadel() {
  log "ZITADEL readiness"
  local zitadel_domain
  zitadel_domain="$(env_value ZITADEL_DOMAIN)"
  compose exec -T zitadel-api sh -lc \
    'curl -fsS -o /dev/null -w "debug_ready %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" --max-time 8 http://127.0.0.1:8080/debug/ready || true'
  compose exec -T zitadel-api sh -lc '
    host="$1"
    curl -fsS -H "Host: ${host}" -H "x-zitadel-instance-host: ${host}" -H "x-zitadel-public-host: ${host}" \
      -o /dev/null -w "discovery %{http_code} ttfb=%{time_starttransfer} total=%{time_total}\n" \
      --max-time 8 http://127.0.0.1:8080/.well-known/openid-configuration || true
  ' sh "$zitadel_domain"
  compose exec -T zitadel-api sh -lc '
    host="$1"
    tmp="$(mktemp)"
    code="$(curl -ksS -H "Host: ${host}" -H "x-zitadel-instance-host: ${host}" -H "x-zitadel-public-host: ${host}" \
      -o "$tmp" -w "%{http_code}" --max-time 8 http://127.0.0.1:8080/debug/metrics || true)"
    echo "debug_metrics ${code:-000}"
    if [[ "$code" == "200" ]]; then
      grep -E "^(process_|go_|http_|grpc_)" "$tmp" | head -80 || true
    fi
    rm -f "$tmp"
  ' sh "$zitadel_domain" | redact_sensitive
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
print_host_processes
print_containers
print_focused_container_samples
audit_resource_policy
audit_proxy_pressure
audit_redis_pressure
probe_internal
audit_zitadel_container
probe_zitadel
probe_postgres
log "Diagnostic complete"

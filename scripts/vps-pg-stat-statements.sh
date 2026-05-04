#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
MODE="audit"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --mode) MODE="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

COMPOSE_FILE="$PROJECT_DIR/docker-compose.dev.yml"
ENV_FILE="$PROJECT_DIR/.env.dev"

log() { printf '\n[pg-stat-statements] %s\n' "$*"; }
compose() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

usage() {
  echo "Usage: $0 [--project-dir PATH] [--mode audit|enable-extension]" >&2
}

require_runtime() {
  [[ -f "$COMPOSE_FILE" ]] || { echo "Missing Compose file: $COMPOSE_FILE" >&2; exit 1; }
  [[ -f "$ENV_FILE" ]] || { echo "Missing env file: $ENV_FILE" >&2; exit 1; }
  case "$MODE" in
    audit|enable-extension) ;;
    *) usage; exit 2 ;;
  esac
}

env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $1 == key {
      value = substr($0, length(key) + 2)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^'\''|'\''$/, "", value)
      gsub(/^"|"$/, "", value)
      print value
    }
  ' "$ENV_FILE" | tail -n 1
}

redact_sensitive() {
  sed -E \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g' \
    -e 's/(authorization|cookie|password|secret|session|token)([=:][^[:space:]]*)/\1=[redacted]/Ig'
}

append_unique_database() {
  local database="$1" candidate
  [[ -n "$database" ]] || return
  [[ "$database" =~ ^[A-Za-z0-9_][-A-Za-z0-9_]*$ ]] || {
    echo "Refusing unsafe database name from env: $database" >&2
    exit 2
  }

  for candidate in "${DATABASES[@]}"; do
    [[ "$candidate" == "$database" ]] && return
  done
  DATABASES+=("$database")
}

build_database_list() {
  DATABASES=()
  append_unique_database "$(env_value POSTGRES_DB)"
  append_unique_database "$(env_value SSO_BACKEND_DB)"
  append_unique_database "$(env_value APP_B_DB)"
  append_unique_database "postgres"
}

psql_scalar() {
  local database="$1" sql="$2"
  compose exec -T postgres sh -lc '
    database="$1"
    sql="$2"
    psql -U "$POSTGRES_USER" -d "$database" -At -v ON_ERROR_STOP=1 -c "$sql"
  ' sh "$database" "$sql"
}

psql_exec() {
  local database="$1" sql="$2"
  compose exec -T postgres sh -lc '
    database="$1"
    sql="$2"
    psql -U "$POSTGRES_USER" -d "$database" -v ON_ERROR_STOP=1 -c "$sql"
  ' sh "$database" "$sql"
}

shared_preload_libraries() {
  psql_scalar "$(env_value POSTGRES_DB)" "show shared_preload_libraries;"
}

preload_enabled() {
  local preload="$1"
  [[ ",${preload//[[:space:]]/}," == *",pg_stat_statements,"* ]]
}

audit_preload() {
  local preload
  preload="$(shared_preload_libraries)"
  echo "shared_preload_libraries=${preload:-<empty>}"
  if preload_enabled "$preload"; then
    echo "preload=ok"
  else
    echo "preload=missing"
    echo "restart-required=true"
    echo "note=Compose now carries the preload setting, but a single live PostgreSQL restart is not zero downtime."
  fi
}

audit_database_extension() {
  local database="$1" state
  state="$(psql_scalar "$database" "select case when exists (select 1 from pg_extension where extname = 'pg_stat_statements') then 'installed' else 'missing' end;")"
  echo "database=$database extension=$state"
}

audit_hot_queries() {
  local database="$1" state
  state="$(psql_scalar "$database" "select case when exists (select 1 from pg_extension where extname = 'pg_stat_statements') then 'installed' else 'missing' end;")"
  [[ "$state" == "installed" ]] || return

  echo "-- hot queries for $database"
  psql_exec "$database" "select calls, round(total_exec_time::numeric, 2) as total_ms, round(mean_exec_time::numeric, 2) as mean_ms, rows, left(query, 220) as query from pg_stat_statements order by total_exec_time desc limit 10;" \
    | redact_sensitive
}

enable_extension() {
  local database="$1"
  psql_exec "$database" "create extension if not exists pg_stat_statements;" >/dev/null
  echo "database=$database extension=ensured"
}

require_runtime
build_database_list

log "PostgreSQL pg_stat_statements audit"
audit_preload

for database in "${DATABASES[@]}"; do
  audit_database_extension "$database"
done

if [[ "$MODE" == "enable-extension" ]]; then
  preload="$(shared_preload_libraries)"
  if ! preload_enabled "$preload"; then
    echo "Refusing to create pg_stat_statements until PostgreSQL is started with shared_preload_libraries=pg_stat_statements." >&2
    echo "Plan a backup-backed maintenance restart or move PostgreSQL to a dedicated identity plane first." >&2
    exit 4
  fi

  log "Ensuring pg_stat_statements extension"
  for database in "${DATABASES[@]}"; do
    enable_extension "$database"
  done
fi

log "Hot query samples"
for database in "${DATABASES[@]}"; do
  audit_hot_queries "$database"
done

log "Complete"

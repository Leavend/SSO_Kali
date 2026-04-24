#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"

ROOT_DIR="$(backup_repo_root)"
BACKUP_COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-${ROOT_DIR}/docker-compose.dev.yml}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-${ROOT_DIR}/.env.dev}"
TARGET_MODE="${TARGET_MODE:-compose}"
OUTPUT_FILE="${OUTPUT_FILE:-${ROOT_DIR}/.artifacts/backup-drills/source-snapshot.env}"
REDIS_DATABASES="${REDIS_DATABASES:-0,1,2,3,4,5}"
POSTGRES_DATABASES="${POSTGRES_DATABASES:-}"

backup_source_env_file "$BACKUP_ENV_FILE"
backup_require_command docker
backup_require_command sort

postgres_query() {
  local database_name="$1"
  local sql="$2"

  if [[ "$TARGET_MODE" == "container" ]]; then
    docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_ADMIN_USER" -d "$database_name" -At -F $'\t' -c "$sql"
    return
  fi

  backup_compose exec -T postgres psql -U "$POSTGRES_ADMIN_USER" -d "$database_name" -At -F $'\t' -c "$sql"
}

redis_dbsize() {
  local database_id="$1"

  if [[ "$TARGET_MODE" == "container" ]]; then
    docker exec -i "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" -n "$database_id" DBSIZE | tr -d '\r'
    return
  fi

  backup_compose exec -T redis redis-cli -a "$REDIS_PASSWORD" -n "$database_id" DBSIZE | tr -d '\r'
}

redis_scan() {
  local database_id="$1"

  if [[ "$TARGET_MODE" == "container" ]]; then
    docker exec -i "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" -n "$database_id" --scan | tr -d '\r'
    return
  fi

  backup_compose exec -T redis redis-cli -a "$REDIS_PASSWORD" -n "$database_id" --scan | tr -d '\r'
}

postgres_database_list() {
  local databases_csv

  databases_csv="${POSTGRES_DATABASES:-${POSTGRES_DB},${SSO_BACKEND_DB},${APP_B_DB}}"
  printf '%s' "$databases_csv" | tr ',' '\n' | sed '/^$/d' | awk '!seen[$0]++'
}

collect_postgres_snapshot() {
  local database_name="$1"
  local env_key
  local snapshot_file
  local table_total=0
  local row_total=0
  env_key="$(backup_sanitize_key "$database_name")"
  snapshot_file="$(mktemp)"

  while IFS=$'\t' read -r schema_name table_name; do
    [[ -n "$schema_name" && -n "$table_name" ]] || continue
    local count
    count="$(postgres_query "$database_name" "SELECT COUNT(*) FROM \"${schema_name//\"/\"\"}\".\"${table_name//\"/\"\"}\";")"
    printf '%s.%s=%s\n' "$schema_name" "$table_name" "$count" >>"$snapshot_file"
    table_total=$((table_total + 1))
    row_total=$((row_total + count))
  done < <(postgres_query "$database_name" "SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename;")

  printf 'POSTGRES_%s_TABLE_COUNT=%s\n' "$env_key" "$table_total" >>"$OUTPUT_FILE"
  printf 'POSTGRES_%s_ROW_TOTAL=%s\n' "$env_key" "$row_total" >>"$OUTPUT_FILE"
  printf 'POSTGRES_%s_TABLE_COUNTS_SHA256=%s\n' "$env_key" "$(backup_sha256_file "$snapshot_file")" >>"$OUTPUT_FILE"
  rm -f "$snapshot_file"
}

collect_redis_snapshot() {
  local tmp_file
  local aggregate_file
  aggregate_file="$(mktemp)"

  IFS=',' read -r -a redis_dbs <<<"$REDIS_DATABASES"

  for database_id in "${redis_dbs[@]}"; do
    local db_key dbsize
    db_key="$(backup_sanitize_key "$database_id")"
    dbsize="$(redis_dbsize "$database_id")"
    printf 'REDIS_DB_%s_KEYS=%s\n' "$db_key" "$dbsize" >>"$OUTPUT_FILE"
    tmp_file="$(mktemp)"
    redis_scan "$database_id" | sort >"$tmp_file" || true
    printf 'REDIS_DB_%s_KEYS_SHA256=%s\n' "$db_key" "$(backup_sha256_file "$tmp_file")" >>"$OUTPUT_FILE"
    cat "$tmp_file" >>"$aggregate_file"
    rm -f "$tmp_file"
  done

  printf 'REDIS_KEYSPACE_SHA256=%s\n' "$(backup_sha256_file "$aggregate_file")" >>"$OUTPUT_FILE"
  rm -f "$aggregate_file"
}

mkdir -p "$(dirname "$OUTPUT_FILE")"
: >"$OUTPUT_FILE"

printf 'RECON_CAPTURED_AT=%s\n' "$(backup_timestamp)" >>"$OUTPUT_FILE"
printf 'RECON_SOURCE_MODE=%s\n' "$TARGET_MODE" >>"$OUTPUT_FILE"

while IFS= read -r database_name; do
  collect_postgres_snapshot "$database_name"
done < <(postgres_database_list)

collect_redis_snapshot

echo "[capture-reconciliation-snapshot] wrote ${OUTPUT_FILE}"

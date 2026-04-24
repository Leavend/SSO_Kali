#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"
source "${SCRIPT_DIR}/backup-status-lib.sh"

ROOT_DIR="$(backup_repo_root)"
BACKUP_COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-${ROOT_DIR}/docker-compose.dev.yml}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-${ROOT_DIR}/.env.dev}"
BACKUP_ROOT="${BACKUP_ROOT:-${ROOT_DIR}/.artifacts/backup-drills}"
STATUS_FILE="$(backup_status_file_path)"
POSTGRES_VOLUME=""
POSTGRES_CONTAINER=""
REDIS_CONTAINER=""
REDIS_RESTORE_DIR=""
BOOTSTRAP_RESTORE_DIR=""
DRILL_OUTPUT_DIR=""
DRILL_ID=""

backup_source_env_file "$BACKUP_ENV_FILE"
backup_require_command docker
backup_require_command tar

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --backup-dir)
        BACKUP_DIR="$2"
        shift 2
        ;;
      *)
        echo "[run-restore-drill][ERROR] unknown argument: $1" >&2
        exit 1
        ;;
    esac
  done
}

resolve_backup_dir() {
  if [[ -n "${BACKUP_DIR:-}" ]]; then
    return
  fi

  BACKUP_DIR="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | tail -n1)"

  if [[ -z "$BACKUP_DIR" ]]; then
    echo "[run-restore-drill][ERROR] no backup directory found" >&2
    exit 1
  fi
}

cleanup() {
  [[ -n "$POSTGRES_CONTAINER" ]] && docker rm -f "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
  [[ -n "$REDIS_CONTAINER" ]] && docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
  [[ -n "$POSTGRES_VOLUME" ]] && docker volume rm "$POSTGRES_VOLUME" >/dev/null 2>&1 || true
  [[ -n "$REDIS_RESTORE_DIR" ]] && rm -rf "$REDIS_RESTORE_DIR"
  [[ -n "$BOOTSTRAP_RESTORE_DIR" ]] && rm -rf "$BOOTSTRAP_RESTORE_DIR"
}

record_failure_and_exit() {
  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    backup_record_restore_failure "$STATUS_FILE" "$DRILL_ID" "${MISMATCH_TOTAL:-999999}"
  fi

  cleanup
  exit "$exit_code"
}

start_postgres_restore() {
  POSTGRES_VOLUME="sso-restore-drill-postgres-${DRILL_ID}"
  POSTGRES_CONTAINER="sso-restore-drill-postgres-${DRILL_ID}"
  docker volume create "$POSTGRES_VOLUME" >/dev/null
  docker run -d --rm --name "$POSTGRES_CONTAINER" \
    -e POSTGRES_DB="$POSTGRES_DB" \
    -e POSTGRES_USER="$POSTGRES_ADMIN_USER" \
    -e POSTGRES_PASSWORD="$POSTGRES_ADMIN_PASSWORD" \
    -v "${POSTGRES_VOLUME}:/var/lib/postgresql/data" \
    "$POSTGRES_IMAGE" >/dev/null
}

wait_for_postgres_restore() {
  until docker exec "$POSTGRES_CONTAINER" pg_isready -U "$POSTGRES_ADMIN_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
    sleep 2
  done
}

ensure_database() {
  local database_name="$1"
  local exists

  exists="$(docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_ADMIN_USER" -d postgres -At -c "SELECT 1 FROM pg_database WHERE datname = '${database_name}'" | tr -d '\r')"

  if [[ "$exists" != "1" ]]; then
    docker exec "$POSTGRES_CONTAINER" createdb -U "$POSTGRES_ADMIN_USER" "$database_name" >/dev/null
  fi
}

restore_database() {
  local database_name="$1"
  local dump_file="$2"
  ensure_database "$database_name"
  cat "$dump_file" | docker exec -i "$POSTGRES_CONTAINER" pg_restore -U "$POSTGRES_ADMIN_USER" -d "$database_name" --clean --if-exists --no-owner --no-privileges >/dev/null
}

start_redis_restore() {
  REDIS_CONTAINER="sso-restore-drill-redis-${DRILL_ID}"
  REDIS_RESTORE_DIR="$(mktemp -d)"
  cp "${BACKUP_DIR}/redis/redis.rdb" "${REDIS_RESTORE_DIR}/dump.rdb"
  docker run -d --rm --name "$REDIS_CONTAINER" \
    -v "${REDIS_RESTORE_DIR}:/data" \
    "$REDIS_IMAGE" \
    redis-server --requirepass "$REDIS_PASSWORD" --dir /data --dbfilename dump.rdb --appendonly no >/dev/null
}

wait_for_redis_restore() {
  until docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" ping >/dev/null 2>&1; do
    sleep 2
  done
}

bootstrap_restore_match() {
  local manifest_file="$1"
  local extracted_hash
  BOOTSTRAP_RESTORE_DIR="$(mktemp -d)"
  tar -xzf "${BACKUP_DIR}/volumes/zitadel-bootstrap.tgz" -C "$BOOTSTRAP_RESTORE_DIR"
  find "$BOOTSTRAP_RESTORE_DIR" -type f | sort | while read -r file; do backup_sha256_file "$file"; done >"${DRILL_OUTPUT_DIR}/bootstrap.contents"
  extracted_hash="$(backup_sha256_file "${DRILL_OUTPUT_DIR}/bootstrap.contents")"
  printf '%s' "$extracted_hash"
}

write_reconciliation_report() {
  local bootstrap_match="$1"
  local bootstrap_hash="$2"

  cat >"${DRILL_OUTPUT_DIR}/reconciliation-report.md" <<EOF
# Restore Drill Reconciliation Report

- Drill ID: \`${DRILL_ID}\`
- Backup ID: \`${BACKUP_ID}\`
- Compared At: \`$(backup_timestamp)\`
- Snapshot Comparison Status: \`${RECON_STATUS}\`
- Snapshot Mismatch Total: \`${MISMATCH_TOTAL}\`
- Bootstrap Archive Match: \`${bootstrap_match}\`
- Bootstrap Restored Content SHA256: \`${bootstrap_hash}\`
- Source Snapshot: \`${BACKUP_DIR}/reconciliation/source-snapshot.env\`
- Target Snapshot: \`${DRILL_OUTPUT_DIR}/target-snapshot.env\`
- Comparison File: \`${DRILL_OUTPUT_DIR}/comparison.env\`
EOF
}

write_evidence_pack() {
  cat >"${DRILL_OUTPUT_DIR}/evidence.md" <<EOF
# Backup Restore Drill Evidence Pack

- Drill ID: \`${DRILL_ID}\`
- Backup ID: \`${BACKUP_ID}\`
- Backup Source: \`${BACKUP_DIR}\`
- Backup Status File: \`${STATUS_FILE}\`
- Postgres Restore Container: \`${POSTGRES_CONTAINER}\`
- Redis Restore Container: \`${REDIS_CONTAINER}\`
- Reconciliation Report: \`${DRILL_OUTPUT_DIR}/reconciliation-report.md\`
- Drill Result: \`${DRILL_RESULT}\`
EOF
}

parse_args "$@"
resolve_backup_dir

BACKUP_ID="$(backup_value_from_file "${BACKUP_DIR}/manifest.env" "BACKUP_ID" "$(basename "$BACKUP_DIR")")"
DRILL_ID="${DRILL_ID:-${BACKUP_ID}-restore}"
DRILL_OUTPUT_DIR="${BACKUP_DIR}/drill"
mkdir -p "$DRILL_OUTPUT_DIR"

trap record_failure_and_exit EXIT

start_postgres_restore
wait_for_postgres_restore
restore_database "$POSTGRES_DB" "${BACKUP_DIR}/postgres/zitadel.dump"
restore_database "$SSO_BACKEND_DB" "${BACKUP_DIR}/postgres/sso-backend.dump"
restore_database "$APP_B_DB" "${BACKUP_DIR}/postgres/app-b.dump"

start_redis_restore
wait_for_redis_restore

OUTPUT_FILE="${DRILL_OUTPUT_DIR}/target-snapshot.env" \
  TARGET_MODE=container \
  POSTGRES_CONTAINER="$POSTGRES_CONTAINER" \
  REDIS_CONTAINER="$REDIS_CONTAINER" \
  "${SCRIPT_DIR}/capture-reconciliation-snapshot.sh"

SOURCE_FILE="${BACKUP_DIR}/reconciliation/source-snapshot.env" \
  TARGET_FILE="${DRILL_OUTPUT_DIR}/target-snapshot.env" \
  OUTPUT_FILE="${DRILL_OUTPUT_DIR}/comparison.env" \
  "${SCRIPT_DIR}/compare-reconciliation-snapshots.sh"

RECON_STATUS="$(backup_value_from_file "${DRILL_OUTPUT_DIR}/comparison.env" "RECON_STATUS" "failure")"
MISMATCH_TOTAL="$(backup_value_from_file "${DRILL_OUTPUT_DIR}/comparison.env" "RECON_MISMATCH_TOTAL" "999999")"
BOOTSTRAP_HASH="$(bootstrap_restore_match "${BACKUP_DIR}/manifest.env")"
EXPECTED_BOOTSTRAP_HASH="$(backup_value_from_file "${BACKUP_DIR}/manifest.env" "ZITADEL_BOOTSTRAP_CONTENT_SHA256" "")"
BOOTSTRAP_MATCH="$([[ "$BOOTSTRAP_HASH" == "$EXPECTED_BOOTSTRAP_HASH" ]] && printf 'true' || printf 'false')"

if [[ "$BOOTSTRAP_MATCH" != "true" ]]; then
  MISMATCH_TOTAL="$((MISMATCH_TOTAL + 1))"
  RECON_STATUS="failure"
fi

write_reconciliation_report "$BOOTSTRAP_MATCH" "$BOOTSTRAP_HASH"
DRILL_RESULT="$RECON_STATUS"
write_evidence_pack

if [[ "$RECON_STATUS" == "success" ]]; then
  backup_record_restore_success "$STATUS_FILE" "$DRILL_ID" "$MISMATCH_TOTAL"
else
  backup_record_restore_failure "$STATUS_FILE" "$DRILL_ID" "$MISMATCH_TOTAL"
fi

trap - EXIT
cleanup

echo "[run-restore-drill] wrote ${DRILL_OUTPUT_DIR}"


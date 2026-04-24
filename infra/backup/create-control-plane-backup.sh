#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"
source "${SCRIPT_DIR}/backup-status-lib.sh"

ROOT_DIR="$(backup_repo_root)"
BACKUP_COMPOSE_FILE="${BACKUP_COMPOSE_FILE:-${ROOT_DIR}/docker-compose.dev.yml}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-${ROOT_DIR}/.env.dev}"
BACKUP_ROOT="${BACKUP_ROOT:-${ROOT_DIR}/.artifacts/backup-drills}"
BACKUP_ID="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_ID}"
STATUS_FILE="$(backup_status_file_path)"
ZITADEL_BOOTSTRAP_VOLUME="${ZITADEL_BOOTSTRAP_VOLUME:-sso-dev-zitadel-bootstrap}"
BACKUP_RUNTIME_IMAGE="${BACKUP_RUNTIME_IMAGE:-alpine:3.20}"

backup_source_env_file "$BACKUP_ENV_FILE"
backup_require_command docker
backup_require_command tar

dump_postgres_database() {
  local database_name="$1"
  local target_file="$2"

  backup_compose exec -T postgres sh -lc "PGPASSWORD='${POSTGRES_ADMIN_PASSWORD}' pg_dump -U '${POSTGRES_ADMIN_USER}' -d '${database_name}' -Fc -Z9" >"$target_file"
}

dump_redis_rdb() {
  local target_file="$1"

  backup_compose exec -T redis sh -lc "redis-cli -a '${REDIS_PASSWORD}' --rdb /tmp/backup.rdb >/dev/null && cat /tmp/backup.rdb && rm -f /tmp/backup.rdb" >"$target_file"
}

archive_bootstrap_volume() {
  local target_file="$1"
  local content_file="$2"
  local archive_name
  archive_name="$(basename "$target_file")"

  docker run --rm -v "${ZITADEL_BOOTSTRAP_VOLUME}:/source:ro" -v "$(dirname "$target_file"):/backup" "$BACKUP_RUNTIME_IMAGE" \
    sh -lc "cd /source && tar -czf '/backup/${archive_name}' ."

  docker run --rm -v "${ZITADEL_BOOTSTRAP_VOLUME}:/source:ro" "$BACKUP_RUNTIME_IMAGE" \
    sh -lc 'cd /source && find . -type f | sort | while read -r file; do sha256sum "$file"; done' >"$content_file"
}

write_manifest() {
  local manifest_file="$1"
  local bootstrap_content_sha="$2"

  cat >"$manifest_file" <<EOF
BACKUP_ID=${BACKUP_ID}
CREATED_AT=$(backup_timestamp)
POSTGRES_ZITADEL_SHA256=$(backup_sha256_file "${BACKUP_DIR}/postgres/zitadel.dump")
POSTGRES_SSO_BACKEND_SHA256=$(backup_sha256_file "${BACKUP_DIR}/postgres/sso-backend.dump")
POSTGRES_APP_B_SHA256=$(backup_sha256_file "${BACKUP_DIR}/postgres/app-b.dump")
REDIS_RDB_SHA256=$(backup_sha256_file "${BACKUP_DIR}/redis/redis.rdb")
ZITADEL_BOOTSTRAP_ARCHIVE_SHA256=$(backup_sha256_file "${BACKUP_DIR}/volumes/zitadel-bootstrap.tgz")
ZITADEL_BOOTSTRAP_CONTENT_SHA256=${bootstrap_content_sha}
SOURCE_SNAPSHOT_FILE=${BACKUP_DIR}/reconciliation/source-snapshot.env
EOF
}

backup_failure() {
  local exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    backup_record_failure "$STATUS_FILE" "$BACKUP_ID"
  fi

  exit "$exit_code"
}

trap backup_failure EXIT

mkdir -p "${BACKUP_DIR}/postgres" "${BACKUP_DIR}/redis" "${BACKUP_DIR}/volumes" "${BACKUP_DIR}/reconciliation"

dump_postgres_database "$POSTGRES_DB" "${BACKUP_DIR}/postgres/zitadel.dump"
dump_postgres_database "$SSO_BACKEND_DB" "${BACKUP_DIR}/postgres/sso-backend.dump"
dump_postgres_database "$APP_B_DB" "${BACKUP_DIR}/postgres/app-b.dump"
dump_redis_rdb "${BACKUP_DIR}/redis/redis.rdb"
archive_bootstrap_volume "${BACKUP_DIR}/volumes/zitadel-bootstrap.tgz" "${BACKUP_DIR}/volumes/zitadel-bootstrap.contents"

OUTPUT_FILE="${BACKUP_DIR}/reconciliation/source-snapshot.env" \
  BACKUP_COMPOSE_FILE="$BACKUP_COMPOSE_FILE" \
  BACKUP_ENV_FILE="$BACKUP_ENV_FILE" \
  TARGET_MODE=compose \
  "${SCRIPT_DIR}/capture-reconciliation-snapshot.sh"

write_manifest \
  "${BACKUP_DIR}/manifest.env" \
  "$(backup_sha256_file "${BACKUP_DIR}/volumes/zitadel-bootstrap.contents")"

backup_record_success "$STATUS_FILE" "$BACKUP_ID"
trap - EXIT

echo "[create-control-plane-backup] wrote ${BACKUP_DIR}"

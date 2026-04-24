#!/usr/bin/env bash

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-common.sh"

backup_status_file_path() {
  local repo_root
  repo_root="$(backup_repo_root)"
  printf '%s' "${BACKUP_STATUS_FILE:-${repo_root}/.artifacts/backup-drills/backup-status.env}"
}

backup_write_status_file() {
  local file_path="$1"
  local backup_status="$2"
  local backup_success_epoch="$3"
  local backup_failure_epoch="$4"
  local backup_failure_total="$5"
  local last_backup_id="$6"
  local restore_status="$7"
  local restore_success_epoch="$8"
  local restore_failure_epoch="$9"
  local restore_failure_total="${10}"
  local restore_mismatch_total="${11}"
  local last_drill_id="${12}"

  mkdir -p "$(dirname "$file_path")"

  cat >"$file_path" <<EOF
BACKUP_STATUS=${backup_status}
BACKUP_LAST_SUCCESS_EPOCH=${backup_success_epoch}
BACKUP_LAST_FAILURE_EPOCH=${backup_failure_epoch}
BACKUP_FAILURE_TOTAL=${backup_failure_total}
LAST_BACKUP_ID=${last_backup_id}
RESTORE_DRILL_STATUS=${restore_status}
RESTORE_DRILL_LAST_SUCCESS_EPOCH=${restore_success_epoch}
RESTORE_DRILL_LAST_FAILURE_EPOCH=${restore_failure_epoch}
RESTORE_DRILL_FAILURE_TOTAL=${restore_failure_total}
RESTORE_DRILL_MISMATCH_TOTAL=${restore_mismatch_total}
LAST_DRILL_ID=${last_drill_id}
EOF
}

backup_record_success() {
  local file_path="$1"
  local backup_id="$2"
  local now_epoch
  now_epoch="$(backup_epoch)"

  backup_write_status_file \
    "$file_path" \
    "success" \
    "$now_epoch" \
    "$(backup_value_from_file "$file_path" "BACKUP_LAST_FAILURE_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "BACKUP_FAILURE_TOTAL" "0")" \
    "$backup_id" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_STATUS" "unknown")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_LAST_SUCCESS_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_LAST_FAILURE_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_FAILURE_TOTAL" "0")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_MISMATCH_TOTAL" "0")" \
    "$(backup_value_from_file "$file_path" "LAST_DRILL_ID" "none")"
}

backup_record_failure() {
  local file_path="$1"
  local backup_id="$2"
  local now_epoch
  local failure_total
  now_epoch="$(backup_epoch)"
  failure_total="$(backup_value_from_file "$file_path" "BACKUP_FAILURE_TOTAL" "0")"
  failure_total="$((failure_total + 1))"

  backup_write_status_file \
    "$file_path" \
    "failure" \
    "$(backup_value_from_file "$file_path" "BACKUP_LAST_SUCCESS_EPOCH" "0")" \
    "$now_epoch" \
    "$failure_total" \
    "$backup_id" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_STATUS" "unknown")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_LAST_SUCCESS_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_LAST_FAILURE_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_FAILURE_TOTAL" "0")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_MISMATCH_TOTAL" "0")" \
    "$(backup_value_from_file "$file_path" "LAST_DRILL_ID" "none")"
}

backup_record_restore_success() {
  local file_path="$1"
  local drill_id="$2"
  local mismatch_total="$3"
  local now_epoch
  now_epoch="$(backup_epoch)"

  backup_write_status_file \
    "$file_path" \
    "$(backup_value_from_file "$file_path" "BACKUP_STATUS" "unknown")" \
    "$(backup_value_from_file "$file_path" "BACKUP_LAST_SUCCESS_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "BACKUP_LAST_FAILURE_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "BACKUP_FAILURE_TOTAL" "0")" \
    "$(backup_value_from_file "$file_path" "LAST_BACKUP_ID" "none")" \
    "success" \
    "$now_epoch" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_LAST_FAILURE_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_FAILURE_TOTAL" "0")" \
    "$mismatch_total" \
    "$drill_id"
}

backup_record_restore_failure() {
  local file_path="$1"
  local drill_id="$2"
  local mismatch_total="$3"
  local now_epoch
  local failure_total
  now_epoch="$(backup_epoch)"
  failure_total="$(backup_value_from_file "$file_path" "RESTORE_DRILL_FAILURE_TOTAL" "0")"
  failure_total="$((failure_total + 1))"

  backup_write_status_file \
    "$file_path" \
    "$(backup_value_from_file "$file_path" "BACKUP_STATUS" "unknown")" \
    "$(backup_value_from_file "$file_path" "BACKUP_LAST_SUCCESS_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "BACKUP_LAST_FAILURE_EPOCH" "0")" \
    "$(backup_value_from_file "$file_path" "BACKUP_FAILURE_TOTAL" "0")" \
    "$(backup_value_from_file "$file_path" "LAST_BACKUP_ID" "none")" \
    "failure" \
    "$(backup_value_from_file "$file_path" "RESTORE_DRILL_LAST_SUCCESS_EPOCH" "0")" \
    "$now_epoch" \
    "$failure_total" \
    "$mismatch_total" \
    "$drill_id"
}


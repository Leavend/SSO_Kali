#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/backup-common.sh"

SOURCE_FILE="${SOURCE_FILE:?SOURCE_FILE is required}"
TARGET_FILE="${TARGET_FILE:?TARGET_FILE is required}"
OUTPUT_FILE="${OUTPUT_FILE:-$(dirname "$TARGET_FILE")/comparison.env}"
mismatch_keys=()
matched_total=0

snapshot_keys() {
  grep -E '^(POSTGRES_|REDIS_)' "$1" | cut -d= -f1 | sort -u || true
}

all_keys="$(printf '%s\n%s\n' "$(snapshot_keys "$SOURCE_FILE")" "$(snapshot_keys "$TARGET_FILE")" | sed '/^$/d' | sort -u)"

while IFS= read -r key; do
  [[ -n "$key" ]] || continue

  if [[ "$(backup_value_from_file "$SOURCE_FILE" "$key" "__missing__")" != "$(backup_value_from_file "$TARGET_FILE" "$key" "__missing__")" ]]; then
    mismatch_keys+=("$key")
    continue
  fi

  matched_total=$((matched_total + 1))
done <<<"$all_keys"

mkdir -p "$(dirname "$OUTPUT_FILE")"

{
  printf 'RECON_COMPARED_AT=%s\n' "$(backup_timestamp)"
  printf 'RECON_SOURCE_FILE=%s\n' "$SOURCE_FILE"
  printf 'RECON_TARGET_FILE=%s\n' "$TARGET_FILE"
  printf 'RECON_MATCHED_KEYS_TOTAL=%s\n' "$matched_total"
  printf 'RECON_MISMATCH_TOTAL=%s\n' "${#mismatch_keys[@]}"
  printf 'RECON_STATUS=%s\n' "$([[ ${#mismatch_keys[@]} -eq 0 ]] && printf 'success' || printf 'failure')"
  printf 'RECON_MISMATCH_KEYS=%s\n' "$(IFS=,; printf '%s' "${mismatch_keys[*]:-}")"
} >"$OUTPUT_FILE"

echo "[compare-reconciliation-snapshots] wrote ${OUTPUT_FILE}"

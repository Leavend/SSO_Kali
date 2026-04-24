#!/usr/bin/env bash
set -euo pipefail

PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-dev-sso.timeh.my.id}"
SITE_AVAILABLE="${SITE_AVAILABLE:-/etc/nginx/sites-available/${PRIMARY_DOMAIN}}"
BACKUP_PATH="${1:-}"

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    printf '[rollback-zero-downtime-migration][ERROR] this script must run as root\n' >&2
    exit 1
  fi
}

main() {
  require_root

  if [[ -z "$BACKUP_PATH" ]]; then
    printf '[rollback-zero-downtime-migration][ERROR] backup path argument is required\n' >&2
    exit 1
  fi

  if [[ ! -f "$BACKUP_PATH" ]]; then
    printf '[rollback-zero-downtime-migration][ERROR] backup file not found: %s\n' "$BACKUP_PATH" >&2
    exit 1
  fi

  install -m 0644 "$BACKUP_PATH" "$SITE_AVAILABLE"
  nginx -t
  systemctl reload nginx
  printf '[rollback-zero-downtime-migration] restored %s from %s\n' "$SITE_AVAILABLE" "$BACKUP_PATH"
}

main

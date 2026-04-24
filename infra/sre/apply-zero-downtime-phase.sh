#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIMARY_DOMAIN="${PRIMARY_DOMAIN:-dev-sso.timeh.my.id}"
SITE_AVAILABLE="${SITE_AVAILABLE:-/etc/nginx/sites-available/${PRIMARY_DOMAIN}}"
SITE_ENABLED="${SITE_ENABLED:-/etc/nginx/sites-enabled/${PRIMARY_DOMAIN}}"
BACKUP_DIR="${BACKUP_DIR:-/etc/nginx/sites-available/backups}"
PHASE="${1:-}"

phase_source() {
  case "$PHASE" in
    phase1)
      printf '%s\n' "${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.canary-phase1.conf"
      ;;
    phase2)
      printf '%s\n' "${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.canary-phase2.conf"
      ;;
    cutover)
      printf '%s\n' "${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.chained.conf"
      ;;
    *)
      printf '[apply-zero-downtime-phase][ERROR] phase must be one of: phase1, phase2, cutover\n' >&2
      exit 1
      ;;
  esac
}

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    printf '[apply-zero-downtime-phase][ERROR] this script must run as root\n' >&2
    exit 1
  fi
}

backup_current() {
  mkdir -p "$BACKUP_DIR"
  cp -a "$SITE_AVAILABLE" "${BACKUP_DIR}/${PRIMARY_DOMAIN}.pre-${PHASE}-$(date +%Y%m%d-%H%M%S)"
}

enable_site() {
  if [[ ! -L "$SITE_ENABLED" ]]; then
    ln -s "$SITE_AVAILABLE" "$SITE_ENABLED"
  fi
}

main() {
  local source_file

  require_root
  source_file="$(phase_source)"

  [[ -f "$source_file" ]] || {
    printf '[apply-zero-downtime-phase][ERROR] missing source file: %s\n' "$source_file" >&2
    exit 1
  }

  [[ -f "$SITE_AVAILABLE" ]] || {
    printf '[apply-zero-downtime-phase][ERROR] missing active site file: %s\n' "$SITE_AVAILABLE" >&2
    exit 1
  }

  backup_current
  install -m 0644 "$source_file" "$SITE_AVAILABLE"
  enable_site
  nginx -t
  systemctl reload nginx
  printf '[apply-zero-downtime-phase] applied %s using %s\n' "$PHASE" "$source_file"
}

main

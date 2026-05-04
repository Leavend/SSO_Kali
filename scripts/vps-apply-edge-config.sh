#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="/opt/sso-prototype-dev"
SHA="manual"
SITE_NAME="dev-sso.timeh.my.id"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift ;;
    --sha) SHA="$2"; shift ;;
    --site-name) SITE_NAME="$2"; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

SRC_SITE="$PROJECT_DIR/infra/nginx/${SITE_NAME}.chained.conf"
SRC_SNIPPETS="$PROJECT_DIR/infra/nginx/snippets"
DST_SITE="/etc/nginx/sites-available/${SITE_NAME}.conf"
DST_ENABLED="/etc/nginx/sites-enabled/${SITE_NAME}.conf"
ENABLED_DIR="/etc/nginx/sites-enabled"
DST_SNIPPETS="/etc/nginx/snippets"
BACKUP_SITE="${DST_SITE}.pre-${SHA}"
BACKUP_ENABLED="/tmp/nginx-sites-enabled-pre-${SHA}.tgz"
BACKUP_SNIPPETS="/tmp/nginx-snippets-pre-${SHA}.tgz"

log() { printf '[edge-config] %s\n' "$*"; }
fail() { printf '[edge-config][ERROR] %s\n' "$*" >&2; exit 1; }

restore_previous() {
  log "Restoring previous Nginx edge config"
  if [ -f "$BACKUP_SITE" ]; then
    install -m 0644 "$BACKUP_SITE" "$DST_SITE"
  fi
  if [ -f "$BACKUP_ENABLED" ]; then
    rm -rf "$ENABLED_DIR"
    mkdir -p /etc/nginx
    tar -xzf "$BACKUP_ENABLED" -C /etc/nginx
  fi
  if [ -f "$BACKUP_SNIPPETS" ]; then
    rm -rf "$DST_SNIPPETS"
    mkdir -p /etc/nginx
    tar -xzf "$BACKUP_SNIPPETS" -C /etc/nginx
  fi
}

disable_stale_site_configs() {
  local path

  shopt -s nullglob
  for path in "$ENABLED_DIR/${SITE_NAME}"*.conf; do
    if [ "$path" != "$DST_ENABLED" ]; then
      log "Disabling stale enabled site config: $path"
      rm -f "$path"
    fi
  done
  shopt -u nullglob
}

[[ -f "$SRC_SITE" ]] || fail "missing source site config: $SRC_SITE"
[[ -d "$SRC_SNIPPETS" ]] || fail "missing source snippets dir: $SRC_SNIPPETS"
command -v nginx >/dev/null 2>&1 || fail "nginx is required on the VPS"

log "Backing up current Nginx edge config"
if [ -f "$DST_SITE" ]; then
  install -m 0644 "$DST_SITE" "$BACKUP_SITE"
fi
if [ -d "$ENABLED_DIR" ]; then
  tar -C /etc/nginx -czf "$BACKUP_ENABLED" "$(basename "$ENABLED_DIR")"
fi
if [ -d "$DST_SNIPPETS" ]; then
  tar -C /etc/nginx -czf "$BACKUP_SNIPPETS" snippets
fi

log "Installing Nginx edge config from release artifact"
install -d -m 0755 "$(dirname "$DST_SITE")" "$ENABLED_DIR" "$DST_SNIPPETS"
install -m 0644 "$SRC_SITE" "$DST_SITE"
cp -a "$SRC_SNIPPETS/." "$DST_SNIPPETS/"
disable_stale_site_configs
ln -sf "$DST_SITE" "$DST_ENABLED"

log "Validating Nginx config"
if ! nginx -t; then
  restore_previous
  nginx -t || true
  fail "new Nginx edge config failed validation"
fi

log "Reloading Nginx without dropping active connections"
nginx -s reload
log "Nginx edge config applied"

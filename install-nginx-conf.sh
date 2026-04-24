#!/usr/bin/env bash
set -euo pipefail

log() { printf '[deploy-nginx] %s\n' "$*"; }
die() { printf '[deploy-nginx][ERROR] %s\n' "$*" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.conf"

[[ -f "$CONF_FILE" ]] || die "Nginx config not found at $CONF_FILE"

if ! command -v nginx >/dev/null 2>&1; then
    die "Nginx is not installed on this system! Are you running Traefik directly?"
fi

log "Copying dev-sso.timeh.my.id.conf to /etc/nginx/sites-available/"
sudo cp "$CONF_FILE" /etc/nginx/sites-available/dev-sso.timeh.my.id.conf

log "Ensuring symlink in sites-enabled/"
sudo ln -sf /etc/nginx/sites-available/dev-sso.timeh.my.id.conf /etc/nginx/sites-enabled/

log "Testing Nginx configuration"
sudo nginx -t

log "Reloading Nginx"
sudo systemctl reload nginx

log "✅ Nginx traffic split configured successfully!"
log "dev-sso.timeh.my.id/ → sso-frontend (3000)"
log "dev-sso.timeh.my.id/authorize → sso-backend (8200)"

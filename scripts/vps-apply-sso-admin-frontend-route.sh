#!/usr/bin/env bash

set -Eeuo pipefail

MODE="audit"
ADMIN_DOMAIN="${SSO_ADMIN_DOMAIN:-admin.timeh.my.id}"
ADMIN_UPSTREAM="${SSO_ADMIN_FRONTEND_INTERNAL_URL:-http://127.0.0.1:3090}"
SITE_AVAILABLE="${ADMIN_SITE_AVAILABLE:-/etc/nginx/sites-available/admin.timeh.my.id.conf}"
SITE_ENABLED="${ADMIN_SITE_ENABLED:-/etc/nginx/sites-enabled/admin.timeh.my.id.conf}"
BACKUP_DIR="${BACKUP_DIR:-/etc/nginx/backups}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
SKIP_CERTBOT="${SKIP_CERTBOT:-false}"

usage() {
  cat <<'USAGE'
Usage: scripts/vps-apply-sso-admin-frontend-route.sh [--mode audit|apply]

Configures the VPS Nginx route for the dedicated SSO admin frontend host.

Environment:
  SSO_ADMIN_DOMAIN                 Admin frontend host. Default: admin.timeh.my.id
  SSO_ADMIN_FRONTEND_INTERNAL_URL  Internal admin frontend URL. Default: http://127.0.0.1:3090
  CERTBOT_EMAIL                    Optional Let's Encrypt account email for first-time certbot setup.
  SKIP_CERTBOT=true                Install HTTP-only config without requesting a certificate.
USAGE
}

log() {
  printf '[sso-admin-route] %s\n' "$*"
}

warn() {
  printf '[sso-admin-route][WARN] %s\n' "$*" >&2
}

die() {
  printf '[sso-admin-route][ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

if [[ "$MODE" != "audit" && "$MODE" != "apply" ]]; then
  die "Invalid --mode: $MODE"
fi

cert_path="/etc/letsencrypt/live/${ADMIN_DOMAIN}/fullchain.pem"
key_path="/etc/letsencrypt/live/${ADMIN_DOMAIN}/privkey.pem"

log "mode=$MODE domain=$ADMIN_DOMAIN upstream=$ADMIN_UPSTREAM site=$SITE_AVAILABLE"
if [[ -f "$SITE_AVAILABLE" ]]; then
  grep -nE "server_name|proxy_pass|ssl_certificate|listen 443|listen 80" "$SITE_AVAILABLE" || true
else
  warn "Nginx site not found yet: $SITE_AVAILABLE"
fi

if [[ "$MODE" == "audit" ]]; then
  exit 0
fi

[[ "$(id -u)" -eq 0 ]] || die 'This script must run as root'
require_command nginx

mkdir -p "$BACKUP_DIR" "$(dirname "$SITE_AVAILABLE")" "$(dirname "$SITE_ENABLED")"
if [[ -f "$SITE_AVAILABLE" ]]; then
  cp -a "$SITE_AVAILABLE" "$BACKUP_DIR/admin.timeh.my.id.conf.$(date +%Y%m%d%H%M%S)"
fi

if [[ ! -f "$cert_path" || ! -f "$key_path" ]]; then
  require_command certbot
  if [[ "$SKIP_CERTBOT" == "true" ]]; then
    warn "Certificate for $ADMIN_DOMAIN is missing and SKIP_CERTBOT=true; installing HTTP-only route"
  else
    certbot_args=(certonly --nginx --non-interactive --keep-until-expiring --cert-name "$ADMIN_DOMAIN" -d "$ADMIN_DOMAIN")
    if [[ -n "$CERTBOT_EMAIL" ]]; then
      certbot_args+=(--agree-tos -m "$CERTBOT_EMAIL")
    elif certbot show_account >/dev/null 2>&1; then
      log 'Reusing existing Certbot account without changing contact email'
    else
      die 'CERTBOT_EMAIL is required when no Certbot account is registered'
    fi
    certbot "${certbot_args[@]}"
  fi
fi

if [[ -f "$cert_path" && -f "$key_path" ]]; then
  cat > "$SITE_AVAILABLE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${ADMIN_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${ADMIN_DOMAIN};

    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass ${ADMIN_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
EOF
else
  cat > "$SITE_AVAILABLE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${ADMIN_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass ${ADMIN_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
    }
}
EOF
fi

ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"
nginx -t
systemctl reload nginx
log "Admin frontend route applied for $ADMIN_DOMAIN"

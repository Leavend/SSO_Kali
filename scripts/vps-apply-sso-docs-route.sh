#!/usr/bin/env bash

set -Eeuo pipefail

MODE="audit"
DOCS_DOMAIN="${SSO_DOCS_DOMAIN:-docs.sso.timeh.my.id}"
DOCS_UPSTREAM="${SSO_DOCS_UPSTREAM:-http://127.0.0.1:8190}"
SITE_AVAILABLE="${DOCS_SITE_AVAILABLE:-/etc/nginx/sites-available/docs.sso.timeh.my.id.conf}"
SITE_ENABLED="${DOCS_SITE_ENABLED:-/etc/nginx/sites-enabled/docs.sso.timeh.my.id.conf}"
BACKUP_DIR="${BACKUP_DIR:-/etc/nginx/backups}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
SKIP_CERTBOT="${SKIP_CERTBOT:-false}"

usage() {
  cat <<'USAGE'
Usage: scripts/vps-apply-sso-docs-route.sh [--mode audit|apply]

Configures the VPS Nginx route for the SSO developer docs host.

Environment:
  SSO_DOCS_DOMAIN     Docs host. Default: docs.sso.timeh.my.id
  SSO_DOCS_UPSTREAM   Internal docs URL. Default: http://127.0.0.1:8190
  CERTBOT_EMAIL       Optional Let's Encrypt account email for first-time certbot setup.
  SKIP_CERTBOT=true   Install HTTP-only config without requesting a certificate.

Prerequisites:
  - DNS A record for SSO_DOCS_DOMAIN must point to this VPS IP
  - The sso-docs container must be running on SSO_DOCS_UPSTREAM
USAGE
}

log() {
  printf '[sso-docs-route] %s\n' "$*"
}

warn() {
  printf '[sso-docs-route][WARN] %s\n' "$*" >&2
}

die() {
  printf '[sso-docs-route][ERROR] %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

assert_no_edge_auth_middleware() {
  local config_root="${NGINX_CONFIG_ROOT:-/etc/nginx}"
  local candidate_files=()
  local file
  local matches

  if [[ ! -d "$config_root" ]]; then
    warn "Nginx config root not found: $config_root"
    return 0
  fi

  while IFS= read -r file; do
    candidate_files+=("$file")
  done < <(grep -RIlF "$DOCS_DOMAIN" "$config_root" 2>/dev/null || true)

  if [[ " ${candidate_files[*]} " != *" $SITE_AVAILABLE "* && -f "$SITE_AVAILABLE" ]]; then
    candidate_files+=("$SITE_AVAILABLE")
  fi

  if [[ "${#candidate_files[@]}" -eq 0 ]]; then
    warn "No Nginx config file references $DOCS_DOMAIN yet"
    return 0
  fi

  matches="$(grep -nE 'auth_request|oauth2-proxy|forwardAuth|ForwardAuth|callbacks/upstream|oauth/v2/authorize|zitadel' "${candidate_files[@]}" 2>/dev/null || true)"
  if [[ -n "$matches" ]]; then
    printf '%s\n' "$matches" >&2
    die "Edge auth middleware found for $DOCS_DOMAIN. Docs site is public static; remove auth_request/ForwardAuth/oauth2-proxy from the docs host route."
  fi
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

cert_path="/etc/letsencrypt/live/${DOCS_DOMAIN}/fullchain.pem"
key_path="/etc/letsencrypt/live/${DOCS_DOMAIN}/privkey.pem"

log "mode=$MODE domain=$DOCS_DOMAIN upstream=$DOCS_UPSTREAM site=$SITE_AVAILABLE"
if [[ -f "$SITE_AVAILABLE" ]]; then
  grep -nE "server_name|proxy_pass|ssl_certificate|listen 443|listen 80" "$SITE_AVAILABLE" || true
else
  warn "Nginx site not found yet: $SITE_AVAILABLE"
fi

if [[ "$MODE" == "audit" ]]; then
  assert_no_edge_auth_middleware
  exit 0
fi

[[ "$(id -u)" -eq 0 ]] || die 'This script must run as root'
require_command nginx

mkdir -p "$BACKUP_DIR" "$(dirname "$SITE_AVAILABLE")" "$(dirname "$SITE_ENABLED")"
if [[ -f "$SITE_AVAILABLE" ]]; then
  cp -a "$SITE_AVAILABLE" "$BACKUP_DIR/docs.sso.timeh.my.id.conf.$(date +%Y%m%d%H%M%S)"
fi

if [[ ! -f "$cert_path" || ! -f "$key_path" ]]; then
  if [[ "$SKIP_CERTBOT" == "true" ]]; then
    warn "Certificate for $DOCS_DOMAIN is missing and SKIP_CERTBOT=true; installing HTTP-only route"
  else
    require_command certbot
    certbot_args=(certonly --nginx --non-interactive --keep-until-expiring --cert-name "$DOCS_DOMAIN" -d "$DOCS_DOMAIN")
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
    server_name ${DOCS_DOMAIN};

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
    server_name ${DOCS_DOMAIN};

    ssl_certificate ${cert_path};
    ssl_certificate_key ${key_path};

    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Cache static assets
    location ~* ^/assets/.+\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        proxy_pass ${DOCS_UPSTREAM};
        proxy_set_header Host \$host;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    location / {
        proxy_pass ${DOCS_UPSTREAM};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
else
  cat > "$SITE_AVAILABLE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOCS_DOMAIN};

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        proxy_pass ${DOCS_UPSTREAM};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
fi

ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"
nginx -t
assert_no_edge_auth_middleware
systemctl reload nginx
log "Docs route applied for $DOCS_DOMAIN"

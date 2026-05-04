#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NGINX_CONFIG="${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.chained.conf"
AUTH_SNIPPET="${ROOT_DIR}/infra/nginx/snippets/sso-auth-sensitive-proxy.conf"

require_pattern() {
  local file="$1"
  local pattern="$2"

  if ! grep -Eq "$pattern" "$file"; then
    printf '[check-auth-edge-hardening][ERROR] %s missing pattern: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

require_pattern "$NGINX_CONFIG" 'location = /authorize'
require_pattern "$NGINX_CONFIG" 'location \^~ /callbacks/'
require_pattern "$NGINX_CONFIG" 'location = /auth/login'
require_pattern "$NGINX_CONFIG" 'location = /auth/callback'
require_pattern "$NGINX_CONFIG" 'location \^~ /auth/'
require_pattern "$NGINX_CONFIG" 'location \^~ /admin/api/'
require_pattern "$NGINX_CONFIG" 'upstream sso_traefik_web '
require_pattern "$NGINX_CONFIG" 'keepalive 64;'
require_pattern "$NGINX_CONFIG" 'include /etc/nginx/snippets/sso-auth-sensitive-proxy\.conf;'
require_pattern "$NGINX_CONFIG" 'limit_req_zone \$binary_remote_addr zone=sso_frontend_login_per_ip:10m rate=20r/m;'
require_pattern "$NGINX_CONFIG" 'limit_req_zone \$binary_remote_addr zone=sso_broker_authorize_per_ip:10m rate=120r/m;'
require_pattern "$NGINX_CONFIG" 'limit_req_zone \$binary_remote_addr zone=sso_broker_callback_per_ip:10m rate=180r/m;'
require_pattern "$NGINX_CONFIG" 'limit_req_zone \$binary_remote_addr zone=sso_frontend_callback_per_ip:10m rate=30r/m;'
require_pattern "$NGINX_CONFIG" 'limit_req_zone \$binary_remote_addr zone=sso_admin_bootstrap_per_ip:10m rate=60r/m;'
require_pattern "$NGINX_CONFIG" 'limit_req zone=sso_broker_authorize_per_ip burst=40 nodelay;'
require_pattern "$NGINX_CONFIG" 'limit_req zone=sso_broker_callback_per_ip burst=60 nodelay;'
require_pattern "$NGINX_CONFIG" 'limit_req zone=sso_frontend_login_per_ip burst=10 nodelay;'
require_pattern "$NGINX_CONFIG" 'limit_req zone=sso_frontend_callback_per_ip burst=20 nodelay;'
require_pattern "$NGINX_CONFIG" 'limit_req zone=sso_admin_bootstrap_per_ip burst=30 nodelay;'

require_pattern "$AUTH_SNIPPET" 'include /etc/nginx/snippets/sso-forwarded-headers\.conf;'
require_pattern "$AUTH_SNIPPET" 'proxy_pass_request_headers on;'
require_pattern "$AUTH_SNIPPET" 'proxy_cookie_domain off;'
require_pattern "$AUTH_SNIPPET" 'proxy_hide_header Cache-Control;'
require_pattern "$AUTH_SNIPPET" 'add_header Cache-Control "no-store, no-cache, private, max-age=0, must-revalidate" always;'
require_pattern "$AUTH_SNIPPET" 'add_header Pragma "no-cache" always;'
require_pattern "$AUTH_SNIPPET" 'add_header Expires "0" always;'
require_pattern "$AUTH_SNIPPET" 'add_header Content-Security-Policy '
require_pattern "$AUTH_SNIPPET" 'proxy_pass http://sso_traefik_web;'

printf '[check-auth-edge-hardening] OK\n'

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NGINX_CONFIG="${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.chained.conf"
NGINX_SNIPPET="${ROOT_DIR}/infra/nginx/snippets/sso-forwarded-headers.conf"
TRAEFIK_CONFIG="${ROOT_DIR}/infra/traefik/traefik.chained.yml"

require_pattern() {
  local file="$1"
  local pattern="$2"

  if ! grep -Eq "$pattern" "$file"; then
    printf '[check-forwarded-header-policy][ERROR] %s missing pattern: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

require_pattern "$NGINX_CONFIG" 'include /etc/nginx/snippets/sso-forwarded-headers\.conf;'
require_pattern "$NGINX_CONFIG" 'upstream sso_traefik_web '
require_pattern "$NGINX_CONFIG" 'keepalive 64;'
require_pattern "$NGINX_CONFIG" "''[[:space:]]+'';"
require_pattern "$NGINX_SNIPPET" 'proxy_set_header Host \$host;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header X-Forwarded-Host \$host;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header X-Forwarded-Proto https;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header X-Forwarded-Port 443;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header Forwarded "for=\$remote_addr;proto=https;host=\$host";'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header X-Forwarded-Ssl on;'
require_pattern "$TRAEFIK_CONFIG" 'trustedIPs:'
require_pattern "$TRAEFIK_CONFIG" '127\.0\.0\.1/32'
require_pattern "$TRAEFIK_CONFIG" '::1/128'
require_pattern "$TRAEFIK_CONFIG" '10\.0\.0\.0/8'
require_pattern "$TRAEFIK_CONFIG" '172\.16\.0\.0/12'
require_pattern "$TRAEFIK_CONFIG" '192\.168\.0\.0/16'

printf '[check-forwarded-header-policy] OK\n'

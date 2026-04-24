#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.dev.yml"
NGINX_CONFIG="${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.chained.conf"

require_pattern() {
  local file="$1"
  local pattern="$2"

  if ! grep -Eq "$pattern" "$file"; then
    printf '[check-telescope-debug-isolation][ERROR] %s missing pattern: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

reject_pattern() {
  local file="$1"
  local pattern="$2"

  if grep -Eq "$pattern" "$file"; then
    printf '[check-telescope-debug-isolation][ERROR] %s contains forbidden pattern: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

require_pattern "$COMPOSE_FILE" 'TELESCOPE_DOMAIN: \$\{TELESCOPE_DOMAIN\}'
require_pattern "$COMPOSE_FILE" 'TELESCOPE_ALLOWED_HOSTS: \$\{TELESCOPE_ALLOWED_HOSTS\}'
require_pattern "$COMPOSE_FILE" 'traefik\.http\.routers\.sso-backend-telescope\.rule=Host\(`\$\{DEBUG_SSO_DOMAIN\}`\) && \(PathPrefix\(`/telescope`\) \|\| PathPrefix\(`/vendor/telescope`\)\)'
reject_pattern "$COMPOSE_FILE" 'traefik\.http\.routers\.sso-backend\.rule=.*PathPrefix\(`/telescope`\)'
reject_pattern "$COMPOSE_FILE" 'traefik\.http\.routers\.sso-backend\.rule=.*PathPrefix\(`/vendor/telescope`\)'

require_pattern "$NGINX_CONFIG" 'server_name dev-sso\.timeh\.my\.id id\.dev-sso\.timeh\.my\.id app-a\.timeh\.my\.id app-b\.timeh\.my\.id;'
require_pattern "$NGINX_CONFIG" 'location \^~ /telescope \{'
require_pattern "$NGINX_CONFIG" 'location \^~ /vendor/telescope/ \{'
require_pattern "$NGINX_CONFIG" 'return 404;'
require_pattern "$NGINX_CONFIG" 'server_name debug\.dev-sso\.timeh\.my\.id;'
require_pattern "$NGINX_CONFIG" 'location \^~ /telescope \{'
require_pattern "$NGINX_CONFIG" 'location \^~ /vendor/telescope/ \{'
require_pattern "$NGINX_CONFIG" 'include /etc/nginx/snippets/sso-auth-sensitive-proxy\.conf;'

printf '[check-telescope-debug-isolation] OK\n'

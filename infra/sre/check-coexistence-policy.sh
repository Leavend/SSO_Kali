#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TRAEFIK_CONFIG="${ROOT_DIR}/infra/traefik/traefik.chained.yml"
TRAEFIK_OVERRIDE="${ROOT_DIR}/infra/traefik/docker-compose.chained.override.yml"
NGINX_CONFIG="${ROOT_DIR}/infra/nginx/dev-sso.timeh.my.id.chained.conf"
NGINX_SNIPPET="${ROOT_DIR}/infra/nginx/snippets/sso-forwarded-headers.conf"

require_pattern() {
  local file="$1"
  local pattern="$2"

  if ! grep -Eq "$pattern" "$file"; then
    printf '[check-coexistence-policy][ERROR] %s missing pattern: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

reject_pattern() {
  local file="$1"
  local pattern="$2"

  if grep -Eq "$pattern" "$file"; then
    printf '[check-coexistence-policy][ERROR] %s contains forbidden pattern: %s\n' "$file" "$pattern" >&2
    exit 1
  fi
}

require_pattern "$TRAEFIK_CONFIG" '^  web:$'
require_pattern "$TRAEFIK_CONFIG" 'address: ":80"'
require_pattern "$TRAEFIK_CONFIG" '^  websecure:$'
require_pattern "$TRAEFIK_CONFIG" 'address: ":443"'

require_pattern "$TRAEFIK_OVERRIDE" '127\.0\.0\.1:18080:80'
require_pattern "$TRAEFIK_OVERRIDE" '127\.0\.0\.1:18443:443'
reject_pattern "$TRAEFIK_OVERRIDE" '(^|[[:space:]"'\''])0\.0\.0\.0:80:80'
reject_pattern "$TRAEFIK_OVERRIDE" '(^|[[:space:]"'\''])0\.0\.0\.0:443:443'
reject_pattern "$TRAEFIK_OVERRIDE" '(^|[[:space:]"'\''])80:80'
reject_pattern "$TRAEFIK_OVERRIDE" '(^|[[:space:]"'\''])443:443'

require_pattern "$NGINX_CONFIG" 'listen 80;'
require_pattern "$NGINX_CONFIG" 'listen 443 ssl http2;'
require_pattern "$NGINX_CONFIG" 'proxy_pass http://127\.0\.0\.1:18080;'
require_pattern "$NGINX_CONFIG" 'include /etc/nginx/snippets/sso-forwarded-headers\.conf;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header Host \$host;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header X-Forwarded-Host \$host;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header X-Forwarded-Proto https;'
require_pattern "$NGINX_SNIPPET" 'proxy_set_header X-Forwarded-Port 443;'
require_pattern "$TRAEFIK_CONFIG" '10\.0\.0\.0/8'
require_pattern "$TRAEFIK_CONFIG" '172\.16\.0\.0/12'
require_pattern "$TRAEFIK_CONFIG" '192\.168\.0\.0/16'

printf '[check-coexistence-policy] OK\n'

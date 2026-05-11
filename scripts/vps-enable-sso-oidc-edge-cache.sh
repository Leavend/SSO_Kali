#!/usr/bin/env bash

set -Eeuo pipefail

API_SITE="${API_SITE:-/etc/nginx/sites-available/api-sso.timeh.my.id.conf}"
CACHE_CONF="${CACHE_CONF:-/etc/nginx/conf.d/sso-oidc-cache.conf}"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="${API_SITE}.pre-oidc-cache-${STAMP}"
CACHE_DIR="${CACHE_DIR:-/var/cache/nginx/sso_oidc_metadata}"
UPSTREAM_NAME="${UPSTREAM_NAME:-sso_backend_prod_frankenphp}"
FORWARDED_SNIPPET="${FORWARDED_SNIPPET:-/etc/nginx/snippets/sso-forwarded-headers.conf}"

log() {
  printf '[sso-nginx-oidc-cache] %s\n' "$*"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    printf '[sso-nginx-oidc-cache][ERROR] run with sudo/root\n' >&2
    exit 1
  fi
}

write_cache_http_config() {
  cat > "$CACHE_CONF" <<'NGINX'
proxy_cache_path /var/cache/nginx/sso_oidc_metadata
    levels=1:2
    keys_zone=sso_oidc_metadata:10m
    max_size=64m
    inactive=1h
    use_temp_path=off;
NGINX
}

patch_site() {
  API_SITE="$API_SITE" \
  UPSTREAM_NAME="$UPSTREAM_NAME" \
  FORWARDED_SNIPPET="$FORWARDED_SNIPPET" \
  python3 - <<'PY'
from __future__ import annotations

import os
import re
from pathlib import Path

path = Path(os.environ['API_SITE'])
upstream = os.environ['UPSTREAM_NAME']
snippet = os.environ['FORWARDED_SNIPPET']
text = path.read_text()
indent = '    '

def oidc_location(route: str, *, shared_jwks_key: bool = False) -> str:
    cache_key = ''
    if shared_jwks_key:
        cache_key = f'{indent}    proxy_cache_key "$scheme://$host/.well-known/jwks.json";\n'

    return f'''{indent}location = {route} {{
{indent}    include {snippet};
{indent}    proxy_pass http://{upstream};
{indent}    proxy_cache sso_oidc_metadata;
{cache_key}{indent}    proxy_cache_methods GET HEAD;
{indent}    proxy_cache_valid 200 5m;
{indent}    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
{indent}    proxy_cache_lock on;
{indent}    proxy_ignore_headers Set-Cookie Cache-Control Expires;
{indent}    proxy_hide_header Set-Cookie;
{indent}    proxy_hide_header Cache-Control;
{indent}    proxy_hide_header X-RateLimit-Limit;
{indent}    proxy_hide_header X-RateLimit-Remaining;
{indent}    proxy_hide_header X-RateLimit-Reset;
{indent}    add_header X-Edge-Cache $upstream_cache_status always;
{indent}    add_header Cache-Control "public, max-age=300, stale-while-revalidate=60" always;
{indent}}}'''

def find_block_end(contents: str, start: int) -> int:
    opening = contents.find('{', start)
    if opening == -1:
        raise RuntimeError('location block has no opening brace')

    depth = 0
    index = opening
    while index < len(contents):
        char = contents[index]
        if char == '{':
            depth += 1
        elif char == '}':
            depth -= 1
            if depth == 0:
                return index + 1
        index += 1

    raise RuntimeError('location block has no closing brace')

def replace_or_insert_location(contents: str, route: str, block: str) -> str:
    match = re.search(rf'^\s*location\s+=\s+{re.escape(route)}\s*\{{', contents, re.MULTILINE)
    if match:
        end = find_block_end(contents, match.start())
        while end < len(contents) and contents[end] in ' \t\r\n':
            end += 1
        return contents[:match.start()] + block + '\n\n' + contents[end:]

    fallback = re.search(r'^\s*location\s+/\s*\{', contents, re.MULTILINE)
    if fallback:
        return contents[:fallback.start()] + block + '\n\n' + contents[fallback.start():]

    server_end = contents.rfind('\n}')
    if server_end == -1:
        raise RuntimeError('could not find server block ending brace')

    return contents[:server_end] + '\n' + block + '\n' + contents[server_end:]

locations = {
    '/.well-known/openid-configuration': oidc_location('/.well-known/openid-configuration'),
    '/.well-known/jwks.json': oidc_location('/.well-known/jwks.json', shared_jwks_key=True),
    '/jwks': oidc_location('/jwks', shared_jwks_key=True),
}

for route, block in locations.items():
    text = replace_or_insert_location(text, route, block)

path.write_text(text)
PY
}

main() {
  require_root
  log "creating cache directory ${CACHE_DIR}"
  mkdir -p "$CACHE_DIR"
  chown www-data:www-data "$CACHE_DIR" || true

  log "backing up ${API_SITE} to ${BACKUP}"
  cp "$API_SITE" "$BACKUP"

  log "writing ${CACHE_CONF}"
  write_cache_http_config

  log "patching ${API_SITE}"
  patch_site

  log 'testing nginx config'
  nginx -t

  log 'reloading nginx'
  systemctl reload nginx

  log 'purging OIDC metadata cache directory'
  find "$CACHE_DIR" -mindepth 1 -delete || true

  log 'completed'
}

main "$@"

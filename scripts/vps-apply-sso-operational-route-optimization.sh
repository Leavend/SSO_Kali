#!/usr/bin/env bash
set -euo pipefail

MODE="audit"
API_SITE="${API_SITE:-/etc/nginx/sites-available/api-sso.timeh.my.id.conf}"
CACHE_CONF="${CACHE_CONF:-/etc/nginx/conf.d/sso-operational-routes-cache.conf}"
BACKUP_DIR="${BACKUP_DIR:-/etc/nginx/backups}"
CACHE_DIR="${CACHE_DIR:-/var/cache/nginx/sso_operational_routes}"
OIDC_CACHE_DIR="${OIDC_CACHE_DIR:-/var/cache/nginx/sso_oidc_metadata}"
UPSTREAM_NAME="${UPSTREAM_NAME:-sso_backend_prod_frankenphp}"
FORWARDED_SNIPPET="${FORWARDED_SNIPPET:-/etc/nginx/snippets/sso-forwarded-headers.conf}"

usage() {
  cat <<'USAGE'
Usage: scripts/vps-apply-sso-operational-route-optimization.sh [--mode audit|apply]

Optimizes active VPS Nginx routes for:
  /up
  /health
  /ready
  /_internal/performance-metrics
  /_internal/queue-metrics

Modes:
  --mode audit  Show current active Nginx route/cache state.
  --mode apply  Backup, patch idempotently, nginx -t, and reload nginx.
USAGE
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
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ "$MODE" != "audit" && "$MODE" != "apply" ]]; then
  echo "Invalid --mode: $MODE" >&2
  exit 2
fi

if [[ ! -f "$API_SITE" ]]; then
  echo "Nginx site not found: $API_SITE" >&2
  exit 1
fi

echo "[sso-op-routes] mode=$MODE site=$API_SITE cache_conf=$CACHE_CONF"
grep -nE 'location = /(up|health|ready)|location = /_internal/(performance-metrics|queue-metrics)|sso_operational_routes|keepalive ' "$API_SITE" "$CACHE_CONF" 2>/dev/null || true

if [[ "$MODE" == "audit" ]]; then
  echo "[sso-op-routes] audit complete. DevOps Lifecycle uses --mode apply during deploy."
  exit 0
fi

sudo mkdir -p "$BACKUP_DIR" "$CACHE_DIR" "$OIDC_CACHE_DIR" "$(dirname "$CACHE_CONF")"
sudo chown -R www-data:www-data "$CACHE_DIR" "$OIDC_CACHE_DIR" || true
sudo cp "$API_SITE" "$BACKUP_DIR/api-sso.timeh.my.id.conf.pre-op-route-optimization.$(date +%Y%m%d%H%M%S)"

sudo tee "$CACHE_CONF" >/dev/null <<'EOF'
proxy_cache_path /var/cache/nginx/sso_operational_routes
    levels=1:2
    keys_zone=sso_operational_routes:10m
    max_size=32m
    inactive=10m
    use_temp_path=off;
EOF

sudo API_SITE="$API_SITE" UPSTREAM_NAME="$UPSTREAM_NAME" FORWARDED_SNIPPET="$FORWARDED_SNIPPET" python3 - <<'PY'
from __future__ import annotations

import os
import re
from pathlib import Path

path = Path(os.environ['API_SITE'])
upstream = os.environ['UPSTREAM_NAME']
snippet = os.environ['FORWARDED_SNIPPET']
text = path.read_text()

text = text.replace('keepalive 32;', 'keepalive 64;')
text = text.replace('keepalive_requests 1000;', 'keepalive_requests 5000;')

indent = '    '
proxy_common = f'''{indent}    include {snippet};
{indent}    proxy_pass http://{upstream};
{indent}    proxy_cache sso_operational_routes;
{indent}    proxy_cache_methods GET HEAD;
{indent}    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
{indent}    proxy_cache_lock on;
{indent}    proxy_buffering on;
{indent}    proxy_buffer_size 16k;
{indent}    proxy_buffers 16 16k;
{indent}    proxy_connect_timeout 1s;
{indent}    proxy_send_timeout 3s;
{indent}    proxy_read_timeout 3s;'''

locations = {
    '/up': f'''{indent}location = /up {{
{indent}    access_log off;
{indent}    default_type text/plain;
{indent}    add_header Cache-Control "no-store" always;
{indent}    return 200 "ok\\n";
{indent}}}''',
    '/health': f'''{indent}location = /health {{
{indent}    access_log off;
{indent}    default_type application/json;
{indent}    add_header Cache-Control "no-store" always;
{indent}    return 200 '{{"service":"sso-backend","healthy":true,"edge":"nginx"}}\\n';
{indent}}}''',
    '/ready': f'''{indent}location = /ready {{
{proxy_common}
{indent}    proxy_cache_valid 200 1s;
{indent}    proxy_cache_valid 503 1s;
{indent}    add_header X-Edge-Cache $upstream_cache_status always;
{indent}    add_header Cache-Control "no-store" always;
{indent}}}''',
    '/_internal/performance-metrics': f'''{indent}location = /_internal/performance-metrics {{
{indent}    allow 127.0.0.1;
{indent}    allow ::1;
{indent}    deny all;
{proxy_common}
{indent}    proxy_cache_valid 200 1s;
{indent}    proxy_cache_valid 403 1s;
{indent}    add_header X-Edge-Cache $upstream_cache_status always;
{indent}    add_header Cache-Control "private, no-store" always;
{indent}}}''',
    '/_internal/queue-metrics': f'''{indent}location = /_internal/queue-metrics {{
{indent}    allow 127.0.0.1;
{indent}    allow ::1;
{indent}    deny all;
{proxy_common}
{indent}    proxy_cache_valid 200 1s;
{indent}    proxy_cache_valid 403 1s;
{indent}    add_header X-Edge-Cache $upstream_cache_status always;
{indent}    add_header Cache-Control "private, no-store" always;
{indent}}}''',
}

def find_location_end(contents: str, start: int) -> int:
    depth = 0
    index = contents.find('{', start)
    if index == -1:
        raise RuntimeError('location block has no opening brace')

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
        end = find_location_end(contents, match.start())
        while end < len(contents) and contents[end] in ' \t\r\n':
            end += 1
        return contents[:match.start()] + block + '\n\n' + contents[end:]

    marker = re.search(r'^\s*location\s+\^~\s+/telescope\s+\{', contents, re.MULTILINE)
    if marker:
        return contents[:marker.start()] + block + '\n\n' + contents[marker.start():]

    server_end = contents.rfind('\n}')
    if server_end == -1:
        raise RuntimeError('could not find server block ending brace')

    return contents[:server_end] + '\n' + block + '\n' + contents[server_end:]

for route, block in locations.items():
    text = replace_or_insert_location(text, route, block)

path.write_text(text)
PY

sudo nginx -t
sudo systemctl reload nginx

echo "[sso-op-routes] applied and nginx reloaded"
echo "[sso-op-routes] rollback: sudo cp $BACKUP_DIR/<backup-file> $API_SITE && sudo nginx -t && sudo systemctl reload nginx"

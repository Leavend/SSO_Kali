#!/usr/bin/env bash
set -euo pipefail

MODE="audit"
API_SITE="/etc/nginx/sites-available/api-sso.timeh.my.id.conf"
BACKUP_DIR="/etc/nginx/backups"
CACHE_DIR="/var/cache/nginx/sso_operational_routes"
OIDC_CACHE_DIR="/var/cache/nginx/sso_oidc_metadata"

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
  --mode audit  Show intended patch readiness without writing config.
  --mode apply  Backup, patch, nginx -t, and reload nginx.
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

echo "[sso-op-routes] mode=$MODE site=$API_SITE"

grep -nE 'location = /(up|health|ready)|location = /_internal/(performance-metrics|queue-metrics)|sso_operational_routes' "$API_SITE" || true

if [[ "$MODE" == "audit" ]]; then
  echo "[sso-op-routes] audit complete. Re-run with --mode apply to patch active Nginx."
  exit 0
fi

sudo mkdir -p "$BACKUP_DIR" "$CACHE_DIR" "$OIDC_CACHE_DIR"
sudo chown -R www-data:www-data "$CACHE_DIR" "$OIDC_CACHE_DIR" || true
sudo cp "$API_SITE" "$BACKUP_DIR/api-sso.timeh.my.id.conf.pre-op-route-optimization.$(date +%Y%m%d%H%M%S)"

python3 - <<'PY'
from pathlib import Path

path = Path('/etc/nginx/sites-available/api-sso.timeh.my.id.conf')
text = path.read_text()

cache_block = '''
proxy_cache_path /var/cache/nginx/sso_operational_routes
    levels=1:2
    keys_zone=sso_operational_routes:10m
    max_size=32m
    inactive=10m
    use_temp_path=off;
'''

if 'keys_zone=sso_operational_routes:10m' not in text:
    marker = 'proxy_cache_path /var/cache/nginx/sso_oidc_metadata'
    if marker in text:
        insert_at = text.find(marker)
        next_block_end = text.find('\n\n', insert_at)
        if next_block_end != -1:
            text = text[:next_block_end + 2] + cache_block + text[next_block_end + 2:]
        else:
            text = cache_block + '\n' + text
    else:
        text = cache_block + '\n' + text

ops_locations = r'''
location = /up {
    access_log off;
    add_header Content-Type text/plain always;
    add_header Cache-Control "no-store" always;
    return 200 "ok\n";
}

location = /health {
    access_log off;
    add_header Content-Type application/json always;
    add_header Cache-Control "no-store" always;
    return 200 '{"service":"sso-backend","healthy":true,"edge":"nginx"}\n';
}

location = /ready {
    proxy_pass http://sso_backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_cache sso_operational_routes;
    proxy_cache_methods GET HEAD;
    proxy_cache_valid 200 1s;
    proxy_cache_valid 503 1s;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    proxy_buffering on;
    proxy_buffer_size 16k;
    proxy_buffers 16 16k;
    proxy_connect_timeout 1s;
    proxy_send_timeout 3s;
    proxy_read_timeout 3s;

    add_header X-Edge-Cache $upstream_cache_status always;
    add_header Cache-Control "no-store" always;
}

location = /_internal/performance-metrics {
    allow 127.0.0.1;
    allow ::1;
    deny all;

    proxy_pass http://sso_backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache sso_operational_routes;
    proxy_cache_methods GET HEAD;
    proxy_cache_valid 200 1s;
    proxy_cache_valid 403 1s;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    proxy_buffering on;
    proxy_buffer_size 16k;
    proxy_buffers 16 16k;
    proxy_connect_timeout 1s;
    proxy_send_timeout 3s;
    proxy_read_timeout 3s;

    add_header X-Edge-Cache $upstream_cache_status always;
    add_header Cache-Control "private, no-store" always;
}

location = /_internal/queue-metrics {
    allow 127.0.0.1;
    allow ::1;
    deny all;

    proxy_pass http://sso_backend_upstream;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache sso_operational_routes;
    proxy_cache_methods GET HEAD;
    proxy_cache_valid 200 1s;
    proxy_cache_valid 403 1s;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_lock on;
    proxy_buffering on;
    proxy_buffer_size 16k;
    proxy_buffers 16 16k;
    proxy_connect_timeout 1s;
    proxy_send_timeout 3s;
    proxy_read_timeout 3s;

    add_header X-Edge-Cache $upstream_cache_status always;
    add_header Cache-Control "private, no-store" always;
}
'''

for needle in [
    'location = /up {',
    'location = /health {',
    'location = /ready {',
    'location = /_internal/performance-metrics {',
    'location = /_internal/queue-metrics {',
]:
    if needle in text:
        raise SystemExit(f'Existing block found for {needle}; apply manually or restore canonical config to avoid duplicate locations.')

server_end = text.rfind('\n}')
if server_end == -1:
    raise SystemExit('Could not find server block ending brace.')

text = text[:server_end] + '\n' + ops_locations + text[server_end:]
path.write_text(text)
PY

sudo nginx -t
sudo systemctl reload nginx

echo "[sso-op-routes] applied and nginx reloaded"
echo "[sso-op-routes] rollback: sudo cp $BACKUP_DIR/<backup-file> $API_SITE && sudo nginx -t && sudo systemctl reload nginx"

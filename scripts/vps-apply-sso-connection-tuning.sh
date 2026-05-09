#!/usr/bin/env bash

set -Eeuo pipefail

MODE="audit"
NGINX_MAIN_CONF="/etc/nginx/nginx.conf"
API_SITE="/etc/nginx/sites-available/api-sso.timeh.my.id.conf"
TUNING_CONF="/etc/nginx/conf.d/sso-connection-tuning.conf"
SYSCTL_CONF="/etc/sysctl.d/99-sso-backend-connection-tuning.conf"
STAMP="$(date -u +%Y%m%d%H%M%S)"

log() {
  printf '[sso-connection-tuning] %s\n' "$*"
}

fail() {
  printf '[sso-connection-tuning][FAIL] %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  sudo scripts/vps-apply-sso-connection-tuning.sh [--mode audit|apply]

Modes:
  audit  Print current state and planned changes without writing files.
  apply  Backup configs, apply tuning, test Nginx, reload Nginx.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-audit}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

case "$MODE" in
  audit|apply) ;;
  *) fail '--mode must be audit or apply' ;;
esac

require_root_for_apply() {
  if [[ "$MODE" == 'apply' && "${EUID}" -ne 0 ]]; then
    fail 'apply mode must run as root/sudo'
  fi
}

backup_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    cp "$file" "${file}.pre-sso-connection-tuning-${STAMP}"
    log "backup=${file}.pre-sso-connection-tuning-${STAMP}"
  fi
}

print_current_state() {
  log 'current kernel queue limits'
  sysctl net.core.somaxconn net.ipv4.tcp_max_syn_backlog net.ipv4.ip_local_port_range 2>/dev/null || true

  log 'current nginx worker/keepalive snippets'
  nginx -T 2>/dev/null \
    | grep -E 'worker_rlimit_nofile|worker_connections|multi_accept|keepalive_timeout|keepalive_requests|ssl_session_cache|ssl_session_timeout|proxy_http_version|proxy_buffering|proxy_buffer_size|proxy_buffers' \
    | sort -u || true
}

write_tuning_conf() {
  cat > "$TUNING_CONF" <<'NGINX'
# Managed by scripts/vps-apply-sso-connection-tuning.sh
# Purpose: reduce connection pressure for public SSO metadata/JWKS load.

ssl_session_cache shared:SSL:20m;
ssl_session_timeout 1h;
ssl_session_tickets off;
NGINX
}

write_sysctl_conf() {
  cat > "$SYSCTL_CONF" <<'SYSCTL'
# Managed by scripts/vps-apply-sso-connection-tuning.sh
# Purpose: improve backlog tolerance for short-lived HTTPS load tests.
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 4096
SYSCTL
}

patch_nginx_main() {
  python3 - <<'PY'
from pathlib import Path

path = Path('/etc/nginx/nginx.conf')
text = path.read_text()

if 'worker_rlimit_nofile' not in text:
    text = text.replace('events {', 'worker_rlimit_nofile 65535;\n\nevents {', 1)

replacements = {
    'worker_connections 768;': 'worker_connections 4096;',
    'worker_connections 1024;': 'worker_connections 4096;',
    'worker_connections 2048;': 'worker_connections 4096;',
    'multi_accept off;': 'multi_accept on;',
}
for old, new in replacements.items():
    text = text.replace(old, new)

if 'multi_accept on;' not in text:
    text = text.replace('events {', 'events {\n\tmulti_accept on;', 1)

if 'keepalive_timeout' in text:
    text = __import__('re').sub(r'keepalive_timeout\s+[^;]+;', 'keepalive_timeout 30s;', text, count=1)
else:
    text = text.replace('http {', 'http {\n\tkeepalive_timeout 30s;', 1)

if 'keepalive_requests' in text:
    text = __import__('re').sub(r'keepalive_requests\s+[^;]+;', 'keepalive_requests 10000;', text, count=1)
else:
    text = text.replace('http {', 'http {\n\tkeepalive_requests 10000;', 1)

path.write_text(text)
PY
}

patch_api_site() {
  python3 - <<'PY'
from pathlib import Path

path = Path('/etc/nginx/sites-available/api-sso.timeh.my.id.conf')
text = path.read_text()

required_proxy_lines = [
    'proxy_http_version 1.1;',
    'proxy_set_header Connection "";',
    'proxy_buffering on;',
    'proxy_buffer_size 16k;',
    'proxy_buffers 16 16k;',
    'proxy_busy_buffers_size 32k;',
]

blocks = [
    'location = /.well-known/openid-configuration {',
    'location = /.well-known/jwks.json {',
    'location = /jwks {',
    'location / {',
]

for marker in blocks:
    start = text.find(marker)
    if start == -1:
        continue
    end = text.find('\n    }', start)
    if end == -1:
        continue
    block = text[start:end]
    insertion = ''
    for line in required_proxy_lines:
        if line not in block:
            insertion += f'        {line}\n'
    if insertion:
        pass_index = block.find('proxy_pass ')
        if pass_index != -1:
            line_end = text.find('\n', start + pass_index)
            text = text[:line_end + 1] + insertion + text[line_end + 1:]

path.write_text(text)
PY
}

apply_tuning() {
  require_root_for_apply
  [[ -f "$NGINX_MAIN_CONF" ]] || fail "missing $NGINX_MAIN_CONF"
  [[ -f "$API_SITE" ]] || fail "missing $API_SITE"

  backup_file "$NGINX_MAIN_CONF"
  backup_file "$API_SITE"
  backup_file "$TUNING_CONF"
  backup_file "$SYSCTL_CONF"

  log 'writing TLS session tuning conf'
  write_tuning_conf

  log 'writing sysctl backlog tuning conf'
  write_sysctl_conf
  sysctl --system >/dev/null || true

  log 'patching nginx main worker/keepalive settings'
  patch_nginx_main

  log 'patching api site proxy connection settings'
  patch_api_site

  log 'testing nginx config'
  nginx -t

  log 'reloading nginx'
  systemctl reload nginx

  log 'completed apply mode'
}

print_plan() {
  log 'planned tuning'
  cat <<'PLAN'
- worker_rlimit_nofile 65535
- worker_connections 4096
- multi_accept on
- keepalive_timeout 30s
- keepalive_requests 10000
- ssl_session_cache shared:SSL:20m
- ssl_session_timeout 1h
- ssl_session_tickets off
- proxy_http_version 1.1
- proxy_set_header Connection ""
- proxy_buffering on
- proxy_buffer_size 16k
- proxy_buffers 16 16k
- net.core.somaxconn=4096
- net.ipv4.tcp_max_syn_backlog=4096
PLAN
}

print_current_state
print_plan

if [[ "$MODE" == 'apply' ]]; then
  apply_tuning
else
  log 'audit mode complete; rerun with --mode apply to change the VPS'
fi

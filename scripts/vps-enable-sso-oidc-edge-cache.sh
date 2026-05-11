#!/usr/bin/env bash

set -Eeuo pipefail

API_SITE="/etc/nginx/sites-available/api-sso.timeh.my.id.conf"
CACHE_CONF="/etc/nginx/conf.d/sso-oidc-cache.conf"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="${API_SITE}.pre-oidc-cache-${STAMP}"
CACHE_DIR="/var/cache/nginx/sso_oidc_metadata"

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
  python3 - <<'PY'
from pathlib import Path

path = Path('/etc/nginx/sites-available/api-sso.timeh.my.id.conf')
text = path.read_text()

replacements = {
"""    location = /.well-known/openid-configuration {
        include /etc/nginx/snippets/sso-forwarded-headers.conf;
        proxy_pass http://sso_backend_prod_frankenphp;
        proxy_hide_header Cache-Control;
        add_header Cache-Control \"public, max-age=300, stale-while-revalidate=60\" always;
    }
""": """    location = /.well-known/openid-configuration {
        include /etc/nginx/snippets/sso-forwarded-headers.conf;
        proxy_pass http://sso_backend_prod_frankenphp;
        proxy_cache sso_oidc_metadata;
        proxy_cache_methods GET HEAD;
        proxy_cache_valid 200 5m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_ignore_headers Set-Cookie Cache-Control Expires;
        proxy_hide_header Set-Cookie;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-RateLimit-Limit;
        proxy_hide_header X-RateLimit-Remaining;
        proxy_hide_header X-RateLimit-Reset;
        add_header X-Edge-Cache $upstream_cache_status always;
        add_header Cache-Control \"public, max-age=300, stale-while-revalidate=60\" always;
    }
""",
"""    location = /.well-known/jwks.json {
        include /etc/nginx/snippets/sso-forwarded-headers.conf;
        proxy_pass http://sso_backend_prod_frankenphp;
        proxy_hide_header Cache-Control;
        add_header Cache-Control \"public, max-age=300, stale-while-revalidate=60\" always;
    }
""": """    location = /.well-known/jwks.json {
        include /etc/nginx/snippets/sso-forwarded-headers.conf;
        proxy_pass http://sso_backend_prod_frankenphp;
        proxy_cache sso_oidc_metadata;
        proxy_cache_key \"$scheme://$host/.well-known/jwks.json\";
        proxy_cache_methods GET HEAD;
        proxy_cache_valid 200 5m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_ignore_headers Set-Cookie Cache-Control Expires;
        proxy_hide_header Set-Cookie;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-RateLimit-Limit;
        proxy_hide_header X-RateLimit-Remaining;
        proxy_hide_header X-RateLimit-Reset;
        add_header X-Edge-Cache $upstream_cache_status always;
        add_header Cache-Control \"public, max-age=300, stale-while-revalidate=60\" always;
    }
""",
"""    location / {
        include /etc/nginx/snippets/sso-forwarded-headers.conf;
        proxy_pass http://sso_backend_prod_frankenphp;
    }
""": """    location = /jwks {
        include /etc/nginx/snippets/sso-forwarded-headers.conf;
        proxy_pass http://sso_backend_prod_frankenphp;
        proxy_cache sso_oidc_metadata;
        proxy_cache_key \"$scheme://$host/.well-known/jwks.json\";
        proxy_cache_methods GET HEAD;
        proxy_cache_valid 200 5m;
        proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
        proxy_cache_lock on;
        proxy_ignore_headers Set-Cookie Cache-Control Expires;
        proxy_hide_header Set-Cookie;
        proxy_hide_header Cache-Control;
        proxy_hide_header X-RateLimit-Limit;
        proxy_hide_header X-RateLimit-Remaining;
        proxy_hide_header X-RateLimit-Reset;
        add_header X-Edge-Cache $upstream_cache_status always;
        add_header Cache-Control \"public, max-age=300, stale-while-revalidate=60\" always;
    }

    location / {
        include /etc/nginx/snippets/sso-forwarded-headers.conf;
        proxy_pass http://sso_backend_prod_frankenphp;
    }
""",
}

for needle, replacement in replacements.items():
    if replacement in text:
        continue
    if needle not in text:
        raise SystemExit(f'missing expected nginx block: {needle[:80]!r}')
    text = text.replace(needle, replacement)

path.write_text(text)
PY
}

main() {
  require_root
  log "creating cache directory ${CACHE_DIR}"
  mkdir -p "$CACHE_DIR"
  chown www-data:www-data "$CACHE_DIR"

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

  log 'completed'
}

main "$@"

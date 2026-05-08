#!/usr/bin/env sh
set -eu

APP_DIR="${APP_DIR:-/app}"
cd "$APP_DIR"

mkdir -p \
    bootstrap/cache \
    storage/framework/cache \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    storage/app/oidc

if [ "${SSO_BACKEND_FIX_PERMISSIONS:-true}" = "true" ]; then
    chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true
fi

if [ "${SSO_BACKEND_WAIT_FOR_DB:-false}" = "true" ]; then
    php artisan db:show --counts=0 --views=0 >/dev/null 2>&1 || {
        echo "Database is not reachable. Check DB_* environment variables." >&2
        exit 1
    }
fi

php artisan package:discover --ansi
php artisan config:cache --ansi
php artisan route:cache --ansi

if [ "${SSO_BACKEND_EVENT_CACHE:-true}" = "true" ]; then
    php artisan event:cache --ansi || true
fi

if [ "${SSO_BACKEND_PASSPORT_KEYS:-false}" = "true" ]; then
    php artisan passport:keys --force --ansi
fi

if [ "${1:-}" = "php" ] && [ "${2:-}" = "artisan" ] && [ "${3:-}" = "queue:work" ]; then
    echo "sso.worker_boot service=sso-backend-worker command='php artisan queue:work' queue=${4:-default} pid=$$"
    exec "$@"
fi

exec php artisan octane:frankenphp \
    --host="${SSO_BACKEND_OCTANE_HOST:-0.0.0.0}" \
    --port="${SSO_BACKEND_OCTANE_PORT:-8000}" \
    --workers="${SSO_BACKEND_OCTANE_WORKERS:-auto}" \
    --max-requests="${SSO_BACKEND_OCTANE_MAX_REQUESTS:-1000}" \
    --caddyfile="${SSO_BACKEND_CADDYFILE:-/etc/caddy/Caddyfile}"

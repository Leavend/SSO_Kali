# syntax=docker/dockerfile:1

# ==============================
# Stage 1: Composer Dependencies
# ==============================
FROM composer:2 AS deps

WORKDIR /app

COPY composer.json composer.lock ./
RUN composer install \
    --no-dev \
    --no-interaction \
    --no-scripts \
    --no-autoloader \
    --prefer-dist

# ==============================
# Stage 2: FrankenPHP Runtime
# ==============================
FROM dunglas/frankenphp:1-php8.4-alpine AS runner

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

RUN apk upgrade --no-cache \
    && apk add --no-cache curl \
    && install-php-extensions \
        pdo_pgsql \
        pcntl \
        redis \
        opcache

RUN { \
    echo 'expose_php=0'; \
    echo 'memory_limit=256M'; \
    echo 'post_max_size=8M'; \
    echo 'upload_max_filesize=2M'; \
    echo 'max_execution_time=30'; \
    echo 'realpath_cache_size=4096K'; \
    echo 'realpath_cache_ttl=600'; \
    echo 'opcache.enable=1'; \
    echo 'opcache.enable_cli=1'; \
    echo 'opcache.memory_consumption=192'; \
    echo 'opcache.interned_strings_buffer=16'; \
    echo 'opcache.max_accelerated_files=20000'; \
    echo 'opcache.validate_timestamps=0'; \
    echo 'opcache.save_comments=1'; \
    echo 'opcache.fast_shutdown=1'; \
    echo 'opcache.jit=off'; \
    echo 'opcache.jit_buffer_size=0'; \
    } > /usr/local/etc/php/conf.d/zz-sso-production.ini

COPY --from=deps /usr/bin/composer /usr/bin/composer
COPY --from=deps /app/vendor ./vendor

LABEL org.opencontainers.image.revision="${VCS_REF}" \
    org.opencontainers.image.created="${BUILD_DATE}" \
    org.opencontainers.image.source="https://github.com/Leavend/SSO_Kali"

RUN echo "${VCS_REF}" > /app/.sso-backend-build-revision

COPY . .
COPY docker/frankenphp/Caddyfile /etc/caddy/Caddyfile
COPY docker/frankenphp/entrypoint.sh /usr/local/bin/sso-backend-entrypoint

RUN composer dump-autoload --optimize --no-dev --no-scripts \
    && mkdir -p \
        bootstrap/cache \
        storage/framework/cache \
        storage/framework/sessions \
        storage/framework/views \
        storage/logs \
        storage/app/oidc \
    && chmod +x /usr/local/bin/sso-backend-entrypoint \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8000

ENV APP_ENV=production
ENV OCTANE_SERVER=frankenphp
ENV SSO_BACKEND_OCTANE_HOST=0.0.0.0
ENV SSO_BACKEND_OCTANE_PORT=8000
ENV SSO_BACKEND_OCTANE_WORKERS=auto
ENV SSO_BACKEND_OCTANE_MAX_REQUESTS=1000
ENV SSO_BACKEND_FIX_PERMISSIONS=true
ENV SSO_BACKEND_EVENT_CACHE=true
ENV SSO_BACKEND_WAIT_FOR_DB=false
ENV SSO_BACKEND_PASSPORT_KEYS=false

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/up || curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["sso-backend-entrypoint"]

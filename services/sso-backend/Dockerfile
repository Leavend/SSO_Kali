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

WORKDIR /app

# PHP extensions required by the SSO backend
RUN install-php-extensions \
    pdo_pgsql \
    pcntl \
    redis \
    opcache

# OPcache tuning for worker mode (persistent process)
RUN { \
    echo 'opcache.enable=1'; \
    echo 'opcache.memory_consumption=128'; \
    echo 'opcache.interned_strings_buffer=16'; \
    echo 'opcache.max_accelerated_files=10000'; \
    echo 'opcache.validate_timestamps=0'; \
    echo 'opcache.jit=1255'; \
    echo 'opcache.jit_buffer_size=64M'; \
    } > /usr/local/etc/php/conf.d/opcache-prod.ini

# Copy composer binary from deps stage
COPY --from=deps /usr/bin/composer /usr/bin/composer

# Copy vendor from deps stage, then copy app source
COPY --from=deps /app/vendor ./vendor
COPY . .

# Run autoload dump in runner stage (has all PHP extensions)
RUN composer dump-autoload --optimize --no-dev --no-scripts

# Create required Laravel directories
RUN mkdir -p \
    bootstrap/cache \
    storage/framework/cache \
    storage/framework/sessions \
    storage/framework/views \
    storage/logs \
    storage/app/oidc

# Non-root user
RUN chown -R www-data:www-data storage bootstrap/cache

EXPOSE 8000

# Entrypoint: start Octane with FrankenPHP
# Migrations are handled by the deploy scripts (deploy-dev.sh / deploy-remote.sh)
CMD ["sh", "-c", "\
    php artisan package:discover --ansi && \
    php artisan config:cache && \
    php artisan route:cache && \
    php artisan octane:frankenphp \
        --host=0.0.0.0 \
        --port=8000 \
        --workers=4 \
        --max-requests=1000 \
    "]

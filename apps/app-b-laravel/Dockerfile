FROM php:8.4-cli-alpine

WORKDIR /app

RUN apk upgrade --no-cache \
    && apk add --no-cache libpq \
    && apk add --no-cache --virtual .build-deps \
    $PHPIZE_DEPS \
    git \
    libpq-dev \
    unzip \
    && docker-php-ext-install pdo_pgsql pcntl

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY . .
RUN mkdir -p bootstrap/cache storage/framework/cache storage/framework/sessions storage/framework/views storage/logs \
    && composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && composer clear-cache \
    && apk del .build-deps

EXPOSE 8000

CMD ["sh", "-lc", "mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs && php artisan migrate --force && php artisan serve --host=0.0.0.0 --port=8000"]

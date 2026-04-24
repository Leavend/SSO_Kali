<?php

declare(strict_types=1);

$csv = static fn (string $value): array => array_values(array_filter(array_map('trim', explode(',', $value))));

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'sso' => [
        'public_issuer' => env('SSO_PUBLIC_ISSUER', env('SSO_ISSUER', 'http://localhost:8200')),
        'internal_base_url' => env('SSO_INTERNAL_BASE_URL', env('SSO_ISSUER', 'http://localhost:8200')),
        'client_id' => env('SSO_CLIENT_ID', 'prototype-app-b'),
        'client_secret' => env('SSO_CLIENT_SECRET', 'prototype-secret'),
        'redirect_uri' => env('SSO_REDIRECT_URI', 'http://localhost:8300/auth/callback'),
        'logout_redirect_uri' => env('SSO_LOGOUT_REDIRECT_URI', 'http://localhost:8300'),
        'jwks_url' => env('SSO_JWKS_URL', 'http://localhost:8200/jwks'),
        'resource_audience' => env('SSO_RESOURCE_AUDIENCE', 'sso-resource-api'),
        'jwt' => [
            'clock_skew_seconds' => (int) env('SSO_JWT_CLOCK_SKEW_SECONDS', 60),
            'allowed_algs' => $csv(env('SSO_JWT_ALLOWED_ALGS', 'ES256,RS256')),
        ],
        'jwks' => [
            'cache_ttl_seconds' => (int) env('SSO_JWKS_CACHE_TTL_SECONDS', 300),
            'min_cache_ttl_seconds' => (int) env('SSO_JWKS_MIN_CACHE_TTL_SECONDS', 30),
            'max_cache_ttl_seconds' => (int) env('SSO_JWKS_MAX_CACHE_TTL_SECONDS', 3600),
            'max_refresh_attempts' => (int) env('SSO_JWKS_MAX_REFRESH_ATTEMPTS', 2),
        ],
    ],

    'resource_api' => [
        'base_url' => env('RESOURCE_API_BASE_URL', env('SSO_INTERNAL_BASE_URL', 'http://localhost:8200')),
    ],

];

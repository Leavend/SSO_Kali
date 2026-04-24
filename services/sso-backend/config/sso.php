<?php

declare(strict_types=1);

$csv = static fn (string $value): array => array_values(array_filter(array_map('trim', explode(',', $value))));

return [
    'engine' => env('SSO_ENGINE', 'zitadel'),
    'base_url' => env('SSO_BASE_URL', env('APP_URL', 'http://localhost:8200')),
    'issuer' => env('SSO_ISSUER', env('APP_URL', 'http://localhost:8200')),
    'resource_audience' => env('SSO_RESOURCE_AUDIENCE', 'sso-resource-api'),
    'upstream_token_key' => env('UPSTREAM_TOKEN_KEY', ''),
    'default_scopes' => [
        'openid',
        'profile',
        'email',
        'offline_access',
    ],
    'broker' => [
        'public_issuer' => env('ZITADEL_BROKER_PUBLIC_ISSUER', env('ZITADEL_ISSUER', 'http://localhost:8080')),
        'internal_issuer' => env('ZITADEL_BROKER_INTERNAL_ISSUER', env('ZITADEL_ISSUER', 'http://localhost:8080')),
        'client_id' => env('ZITADEL_BROKER_CLIENT_ID', 'prototype-sso-broker'),
        'client_secret' => env('ZITADEL_BROKER_CLIENT_SECRET', 'prototype-broker-secret'),
        'redirect_uri' => env('ZITADEL_BROKER_REDIRECT_URI', env('APP_URL', 'http://localhost:8200').'/callbacks/zitadel'),
        'scope' => env('ZITADEL_BROKER_SCOPE', 'openid profile email offline_access'),
    ],
    'ttl' => [
        'access_token_minutes' => (int) env('OIDC_ACCESS_TOKEN_TTL', 15),
        'id_token_minutes' => (int) env('OIDC_ID_TOKEN_TTL', 15),
        'refresh_token_days' => (int) env('OIDC_REFRESH_TOKEN_TTL_DAYS', 30),
        'refresh_token_family_days' => (int) env('OIDC_REFRESH_TOKEN_FAMILY_TTL_DAYS', 90),
    ],
    'signing' => [
        'alg' => env('OIDC_SIGNING_ALG', 'ES256'),
        'kid' => env('OIDC_SIGNING_KID', 'prototype-key-1'),
        'private_key_path' => env('OIDC_PRIVATE_KEY_PATH', storage_path('app/oidc/private.pem')),
        'public_key_path' => env('OIDC_PUBLIC_KEY_PATH', storage_path('app/oidc/public.pem')),
    ],
    'jwt' => [
        'clock_skew_seconds' => (int) env('JWT_CLOCK_SKEW_SECONDS', 60),
        'local_allowed_algs' => $csv(env('JWT_LOCAL_ALLOWED_ALGS', env('OIDC_SIGNING_ALG', 'ES256'))),
        'upstream_allowed_algs' => $csv(env('JWT_UPSTREAM_ALLOWED_ALGS', 'RS256')),
    ],
    'jwks' => [
        'cache_ttl_seconds' => (int) env('JWT_JWKS_CACHE_TTL_SECONDS', 300),
        'min_cache_ttl_seconds' => (int) env('JWT_JWKS_MIN_CACHE_TTL_SECONDS', 30),
        'max_cache_ttl_seconds' => (int) env('JWT_JWKS_MAX_CACHE_TTL_SECONDS', 3600),
        'max_refresh_attempts' => (int) env('JWT_JWKS_MAX_REFRESH_ATTEMPTS', 2),
    ],
    'client_secret_hash' => [
        'memory_cost' => (int) env('OIDC_CLIENT_SECRET_HASH_MEMORY_KIB', 65536),
        'time_cost' => (int) env('OIDC_CLIENT_SECRET_HASH_TIME_COST', 4),
        'threads' => (int) env('OIDC_CLIENT_SECRET_HASH_THREADS', 2),
    ],
    'stores' => [
        'auth_request_seconds' => (int) env('OIDC_AUTH_REQUEST_TTL', 900),
        'auth_request_fallback_seconds' => (int) env('OIDC_AUTH_REQUEST_FALLBACK_TTL', 1800),
        'authorization_code_seconds' => (int) env('OIDC_AUTHORIZATION_CODE_TTL', 120),
    ],
    'rate_limits' => [
        'authorize_per_minute' => (int) env('OIDC_AUTHORIZE_RATE_LIMIT_PER_MINUTE', 20),
        'callback_per_minute' => (int) env('OIDC_CALLBACK_RATE_LIMIT_PER_MINUTE', 30),
        'token_per_minute' => (int) env('OIDC_TOKEN_RATE_LIMIT_PER_MINUTE', 30),
        'admin_bootstrap_per_minute' => (int) env('ADMIN_PANEL_BOOTSTRAP_RATE_LIMIT_PER_MINUTE', 20),
    ],
    'admin' => [
        'panel_client_id' => env('ADMIN_PANEL_CLIENT_ID', 'sso-admin-panel'),
        'session_management_roles' => $csv(env('ADMIN_PANEL_SESSION_MANAGEMENT_ROLES', 'admin')),
        'rate_limits' => [
            'read_per_minute' => (int) env('ADMIN_PANEL_READ_RATE_LIMIT_PER_MINUTE', 60),
            'write_per_minute' => (int) env('ADMIN_PANEL_WRITE_RATE_LIMIT_PER_MINUTE', 10),
        ],
        'freshness' => [
            'read_seconds' => (int) env('ADMIN_PANEL_FRESH_AUTH_SECONDS', 900),
            'step_up_seconds' => (int) env('ADMIN_PANEL_STEP_UP_AUTH_SECONDS', 300),
        ],
        'mfa' => [
            'enforced' => (bool) env('ADMIN_PANEL_REQUIRE_MFA', true),
            'accepted_amr' => $csv(env('ADMIN_PANEL_MFA_ACCEPTED_AMR', 'mfa')),
        ],
    ],
    'admin_emails' => array_filter(array_map(
        'trim',
        explode(',', env('ADMIN_PANEL_ADMIN_EMAIL', '')),
    )),
];

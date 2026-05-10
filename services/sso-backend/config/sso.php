<?php

declare(strict_types=1);

$csv = static fn (string $value): array => array_values(array_filter(array_map('trim', explode(',', $value))));

return [
    'engine' => env('SSO_ENGINE', 'native'),
    'base_url' => env('SSO_BASE_URL', env('APP_URL', 'http://localhost:8200')),
    'issuer' => env('SSO_ISSUER', env('APP_URL', 'http://localhost:8200')),
    'resource_audience' => env('SSO_RESOURCE_AUDIENCE', 'sso-resource-api'),
    'frontend_url' => env('SSO_FRONTEND_URL', env('APP_URL', 'http://localhost:3000')),
    'login_url' => env('SSO_LOGIN_URL', env('SSO_FRONTEND_URL', 'http://localhost:3000').'/login'),
    'observability' => [
        'request_timing_log_enabled' => (bool) env('SSO_REQUEST_TIMING_LOG_ENABLED', false),
        'request_timing_sample_rate' => (float) env('SSO_REQUEST_TIMING_SAMPLE_RATE', 0.0),
        'request_timing_slow_ms' => (float) env('SSO_REQUEST_TIMING_SLOW_MS', 500),
        'internal_queue_metrics_enabled' => (bool) env('SSO_INTERNAL_QUEUE_METRICS_ENABLED', false),
    ],
    'audit' => [
        'authentication_retention_days' => (int) env('SSO_AUTHENTICATION_AUDIT_RETENTION_DAYS', 400),
    ],
    'seed' => [
        'admin_email' => env('SSO_ADMIN_EMAIL', 'admin@example.test'),
        'admin_password' => env('SSO_ADMIN_PASSWORD', 'change-me-admin-password'),
        'admin_subject_id' => env('SSO_ADMIN_SUBJECT_ID', 'usr_admin'),
    ],
    'logout' => [
        'backchannel_timeout_seconds' => (int) env('OIDC_BACKCHANNEL_LOGOUT_TIMEOUT_SECONDS', 5),
        'backchannel_backoff_seconds' => $csv(env('OIDC_BACKCHANNEL_LOGOUT_BACKOFF_SECONDS', '10,30,90')),
        'backchannel_require_https' => (bool) env('OIDC_BACKCHANNEL_LOGOUT_REQUIRE_HTTPS', true),
    ],
    'upstream_token_key' => env('UPSTREAM_TOKEN_KEY', ''),
    'default_scopes' => [
        'openid',
        'profile',
        'email',
        'offline_access',
    ],
    'broker' => [
        'public_issuer' => env('OIDC_UPSTREAM_PUBLIC_ISSUER', env('SSO_ISSUER', env('APP_URL', 'http://localhost:8200'))),
        'internal_issuer' => env('OIDC_UPSTREAM_INTERNAL_ISSUER', env('SSO_ISSUER', env('APP_URL', 'http://localhost:8200'))),
        'client_id' => env('OIDC_UPSTREAM_CLIENT_ID', ''),
        'client_secret' => env('OIDC_UPSTREAM_CLIENT_SECRET', ''),
        'redirect_uri' => env('OIDC_UPSTREAM_REDIRECT_URI', env('APP_URL', 'http://localhost:8200').'/callbacks/upstream'),
        'scope' => env('OIDC_UPSTREAM_SCOPE', 'openid profile email offline_access'),
    ],
    'session' => [
        'cookie' => env('SSO_SESSION_COOKIE', 'sso_session'),
        'cookie_domain' => env('SSO_SESSION_COOKIE_DOMAIN'),
        'cookie_secure' => (bool) env('SSO_SESSION_COOKIE_SECURE', true),
        'cookie_same_site' => env('SSO_SESSION_COOKIE_SAME_SITE', 'lax'),
        'ttl_minutes' => (int) env('SSO_SESSION_TTL_MINUTES', 480),
    ],
    'ttl' => [
        'access_token_minutes' => (int) env('OIDC_ACCESS_TOKEN_TTL', 15),
        'id_token_minutes' => (int) env('OIDC_ID_TOKEN_TTL', 15),
        'refresh_token_days' => (int) env('OIDC_REFRESH_TOKEN_TTL_DAYS', 30),
        'refresh_token_family_days' => (int) env('OIDC_REFRESH_TOKEN_FAMILY_TTL_DAYS', 90),
    ],
    'signing' => [
        'alg' => env('OIDC_SIGNING_ALG', 'ES256'),
        'kid' => env('OIDC_SIGNING_KID', 'sso-key-1'),
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
        'memory_cost' => (int) env('OIDC_CLIENT_SECRET_HASH_MEMORY_KIB', 19456),
        'time_cost' => (int) env('OIDC_CLIENT_SECRET_HASH_TIME_COST', 3),
        'threads' => (int) env('OIDC_CLIENT_SECRET_HASH_THREADS', 1),
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
        'discovery_per_minute' => (int) env('OIDC_DISCOVERY_RATE_LIMIT_PER_MINUTE', 60),
        'jwks_per_minute' => (int) env('OIDC_JWKS_RATE_LIMIT_PER_MINUTE', 60),
    ],
    'admin' => [
        'panel_client_id' => env('ADMIN_PANEL_CLIENT_ID', 'sso-admin-panel'),
        'panel_redirect_uri' => env('ADMIN_PANEL_REDIRECT_URI', rtrim((string) env('SSO_FRONTEND_URL', env('APP_URL', 'http://localhost:3000')), '/').'/auth/callback'),
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

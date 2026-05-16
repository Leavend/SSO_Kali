<?php

declare(strict_types=1);

$csv = static fn (string $value): array => array_values(array_filter(array_map('trim', explode(',', $value))));

return [
    'engine' => env('SSO_ENGINE', 'native'),
    'base_url' => env('SSO_BASE_URL', env('APP_URL', 'http://localhost:8200')),
    'issuer' => env('SSO_ISSUER', env('APP_URL', 'http://localhost:8200')),
    // FR-031 / BE-FR031-001 — Access token audience policy.
    //
    // The MVP issues a single global resource audience for every access
    // token (carried in `aud`). Resource servers behind this SSO MUST
    // validate `aud === sso.resource_audience`. Multi-resource audience
    // routing (per-API audiences derived from client policy) is not yet
    // supported and intentionally documented here so future work has a
    // single anchor; until that ships, anything calling `aud` policy a
    // "per-API" gate is wrong.
    'resource_audience' => env('SSO_RESOURCE_AUDIENCE', 'sso-resource-api'),
    'frontend_url' => env('SSO_FRONTEND_URL', env('APP_URL', 'http://localhost:3000')),
    'login_url' => env('SSO_LOGIN_URL', env('SSO_FRONTEND_URL', 'http://localhost:3000').'/login'),
    'observability' => [
        'request_timing_log_enabled' => (bool) env('SSO_REQUEST_TIMING_LOG_ENABLED', false),
        'request_timing_sample_rate' => (float) env('SSO_REQUEST_TIMING_SAMPLE_RATE', 0.0),
        'request_timing_slow_ms' => (float) env('SSO_REQUEST_TIMING_SLOW_MS', 500),
        'internal_queue_metrics_enabled' => (bool) env('SSO_INTERNAL_QUEUE_METRICS_ENABLED', false),
        'readiness_queue_snapshot_enabled' => (bool) env('SSO_READINESS_QUEUE_SNAPSHOT_ENABLED', false),
        'readiness_external_idp_snapshot_enabled' => (bool) env('SSO_READINESS_EXTERNAL_IDP_SNAPSHOT_ENABLED', false),
        'internal_metrics_token_header' => env('SSO_INTERNAL_METRICS_TOKEN_HEADER', 'X-SSO-Internal-Metrics-Token'),
        'internal_metrics_token' => env('SSO_INTERNAL_METRICS_TOKEN'),
    ],
    // FR-057 / BE-FR057-001 — external IdP federation runtime tunables.
    //
    // These keys back ExternalIdpDiscoveryService, ExternalIdpJwksService,
    // ExternalIdpTokenExchangeService, ExternalIdpHealthProbeService and the
    // ExternalIdpAuthenticationRedirectService. They were previously read
    // from `sso.external_idp.*` without being declared here, leaving ops
    // without env knobs and breaking config:cache audits.
    'external_idp' => [
        'discovery_timeout_seconds' => (int) env('SSO_EXTERNAL_IDP_DISCOVERY_TIMEOUT_SECONDS', 5),
        'discovery_retry_attempts' => (int) env('SSO_EXTERNAL_IDP_DISCOVERY_RETRY_ATTEMPTS', 1),
        'discovery_cache_ttl_seconds' => (int) env('SSO_EXTERNAL_IDP_DISCOVERY_CACHE_TTL_SECONDS', 600),
        'discovery_stale_ttl_seconds' => (int) env('SSO_EXTERNAL_IDP_DISCOVERY_STALE_TTL_SECONDS', 86400),
        'jwks_timeout_seconds' => (int) env('SSO_EXTERNAL_IDP_JWKS_TIMEOUT_SECONDS', 5),
        'jwks_retry_attempts' => (int) env('SSO_EXTERNAL_IDP_JWKS_RETRY_ATTEMPTS', 1),
        'token_timeout_seconds' => (int) env('SSO_EXTERNAL_IDP_TOKEN_TIMEOUT_SECONDS', 5),
        'health_timeout_seconds' => (int) env('SSO_EXTERNAL_IDP_HEALTH_TIMEOUT_SECONDS', 3),
        'callback_url' => env('SSO_EXTERNAL_IDP_CALLBACK_URL'),
        'auth_state_ttl_seconds' => (int) env('SSO_EXTERNAL_IDP_AUTH_STATE_TTL_SECONDS', 300),
        // Federation start route public exposure. When false, the public
        // `/external-idp/start/{providerKey}` route will return 404 even if
        // providers exist. Matches deploy posture; flip on per env after
        // routing/SSL is verified.
        'public_start_route_enabled' => (bool) env('SSO_EXTERNAL_IDP_PUBLIC_START_ENABLED', false),
        // Missing-email policy for federated subjects. `reject` aborts the
        // login when the upstream IdP omits a verified email. `subject_only`
        // proceeds without an email and uses provider+sub as the local key.
        'missing_email_strategy' => env('SSO_EXTERNAL_IDP_MISSING_EMAIL_STRATEGY', 'reject'),
        // Circuit breaker — number of consecutive probe failures required
        // before the provider is automatically pulled from the failover
        // pool. The breaker resets to closed on the next successful probe.
        'failure_threshold' => (int) env('SSO_EXTERNAL_IDP_FAILURE_THRESHOLD', 3),
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
    ],
    'upstream_oidc' => [
        'public_issuer' => env('OIDC_UPSTREAM_PUBLIC_ISSUER', env('SSO_ISSUER', env('APP_URL', 'http://localhost:8200'))),
        'internal_issuer' => env('OIDC_UPSTREAM_INTERNAL_ISSUER', env('SSO_ISSUER', env('APP_URL', 'http://localhost:8200'))),
        'client_id' => env('OIDC_UPSTREAM_CLIENT_ID', ''),
        'client_secret' => env('OIDC_UPSTREAM_CLIENT_SECRET', ''),
        'redirect_uri' => env('OIDC_UPSTREAM_REDIRECT_URI', env('APP_URL', 'http://localhost:8200').'/callbacks/upstream'),
        'scope' => env('OIDC_UPSTREAM_SCOPE', 'openid profile email offline_access'),
    ],
    'session' => [
        'cookie' => env('SSO_SESSION_COOKIE', '__Host-sso_session'),
        'cookie_same_site' => env('SSO_SESSION_COOKIE_SAME_SITE', 'lax'),
        'ttl_minutes' => (int) env('SSO_SESSION_TTL_MINUTES', 480),
        'idle_minutes' => (int) env('SSO_SESSION_IDLE_MINUTES', 30),
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
    'public_metadata' => [
        'cache_ttl_seconds' => (int) env('OIDC_PUBLIC_METADATA_CACHE_TTL_SECONDS', 300),
        'stale_while_revalidate_seconds' => (int) env('OIDC_PUBLIC_METADATA_STALE_WHILE_REVALIDATE_SECONDS', 60),
    ],
    'client_secret_hash' => [
        'memory_cost' => (int) env('OIDC_CLIENT_SECRET_HASH_MEMORY_KIB', 19456),
        'time_cost' => (int) env('OIDC_CLIENT_SECRET_HASH_TIME_COST', 3),
        'threads' => (int) env('OIDC_CLIENT_SECRET_HASH_THREADS', 1),
    ],
    // FR-009: secret lifecycle. After rotation, secret_expires_at is set to
    // now()+ttl_days. Clients should rotate before that window closes.
    'client_secret' => [
        'ttl_days' => (int) env('SSO_CLIENT_SECRET_TTL_DAYS', 90),
        'plaintext_length' => (int) env('SSO_CLIENT_SECRET_PLAINTEXT_LENGTH', 64),
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
        'resource_per_minute' => (int) env('OIDC_RESOURCE_RATE_LIMIT_PER_MINUTE', 60),
        'profile_api_per_minute' => (int) env('SSO_PROFILE_API_RATE_LIMIT_PER_MINUTE', 240),
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
            // FR-018 / BE-FR018-001: production safe default. Grace period MUST be 0
            // in production. The deploy guard `sso:check-admin-mfa-policy` enforces
            // this and the EnsureAdminMfaEnrolled middleware clamps to 0 at runtime.
            'grace_period_hours' => (int) env('ADMIN_MFA_GRACE_PERIOD_HOURS', 0),
        ],
    ],
    'admin_emails' => array_filter(array_map(
        'trim',
        explode(',', env('ADMIN_PANEL_ADMIN_EMAIL', '')),
    )),
    'mfa' => [
        'totp' => [
            'issuer' => env('MFA_TOTP_ISSUER', env('APP_NAME', 'SSO')),
            'digits' => (int) env('MFA_TOTP_DIGITS', 6),
            'period' => (int) env('MFA_TOTP_PERIOD', 30),
        ],
        'challenge_ttl_seconds' => (int) env('MFA_CHALLENGE_TTL_SECONDS', 300),
        'challenge_max_attempts' => (int) env('MFA_CHALLENGE_MAX_ATTEMPTS', 5),
        'recovery_code_count' => (int) env('MFA_RECOVERY_CODE_COUNT', 8),
    ],
];

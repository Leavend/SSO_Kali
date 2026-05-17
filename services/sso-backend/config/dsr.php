<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Data Subject Request PII Table Registry
    |--------------------------------------------------------------------------
    |
    | Source of truth for tables that contain subject-linked PII or bearer
    | material. DSR fulfillment code and coverage tests must stay in sync with
    | this list before destructive delete/anonymize execution can be approved.
    |
    */
    'pii_tables' => [
        'users',
        'external_subject_links',
        'mfa_credentials',
        'mfa_recovery_codes',
        'user_consents',
        'sso_sessions',
        'oidc_rp_sessions',
        'oauth_access_tokens',
        'oauth_refresh_tokens',
        'refresh_token_rotations',
        'password_reset_tokens',
    ],

    'dry_run_artifact_ttl_hours' => 24,
];

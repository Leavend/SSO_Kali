<?php

declare(strict_types=1);

$appUrl = (string) env('APP_URL', 'http://localhost:8200');
$frontendUrl = rtrim((string) env('SSO_FRONTEND_URL', 'http://localhost:3000'), '/');
$loadTestEnabled = (bool) env('SSO_LOAD_TEST_CLIENT_ENABLED', false);
$loadTestClientId = (string) env('SSO_LOAD_TEST_CLIENT_ID', 'sso-load-test-client');

$lockedProductionClientIds = [
    env('APP_A_CLIENT_ID', 'app-a'),
    env('APP_B_CLIENT_ID', 'app-b'),
    // sso-admin-panel: legacy entry kept as archive. Admin UI will move to a
    // dedicated sso-frontend-admin service in the future; removal deferred
    // until that migration lands to avoid breaking existing contract tests.
    env('ADMIN_PANEL_CLIENT_ID', 'sso-admin-panel'),
    env('SSO_PORTAL_CLIENT_ID', 'sso-frontend-portal'),
];

$clients = [
    env('APP_A_CLIENT_ID', 'app-a') => [
        'type' => 'public',
        'redirect_uris' => [
            env('APP_A_REDIRECT_URI', $frontendUrl.'/app-a/auth/callback'),
        ],
        'post_logout_redirect_uris' => [
            env('APP_A_POST_LOGOUT_REDIRECT_URI', $frontendUrl.'/app-a'),
        ],
        'backchannel_logout_uri' => env('APP_A_BACKCHANNEL_LOGOUT_URI'),
        'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
    ],

    env('APP_B_CLIENT_ID', 'app-b') => [
        'type' => 'confidential',
        'secret' => env('APP_B_CLIENT_SECRET_HASH'),
        'secret_expires_at' => env('APP_B_CLIENT_SECRET_EXPIRES_AT'),
        'redirect_uris' => [
            env('APP_B_REDIRECT_URI', $frontendUrl.'/app-b/auth/callback'),
        ],
        'post_logout_redirect_uris' => [
            env('APP_B_POST_LOGOUT_REDIRECT_URI', $frontendUrl.'/app-b'),
        ],
        'backchannel_logout_uri' => env('APP_B_BACKCHANNEL_LOGOUT_URI'),
        'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
    ],

    // sso-admin-panel: legacy archive; see $lockedProductionClientIds note above.
    env('ADMIN_PANEL_CLIENT_ID', 'sso-admin-panel') => [
        'type' => 'public',
        'redirect_uris' => [
            env('ADMIN_PANEL_REDIRECT_URI', $frontendUrl.'/auth/callback'),
        ],
        'post_logout_redirect_uris' => [
            env('ADMIN_PANEL_POST_LOGOUT_REDIRECT_URI', $frontendUrl),
        ],
        'backchannel_logout_uri' => env(
            'ADMIN_PANEL_BACKCHANNEL_LOGOUT_URI',
            $appUrl.'/connect/backchannel/admin-panel/logout',
        ),
        'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access', 'roles', 'permissions'],
    ],

    env('SSO_PORTAL_CLIENT_ID', 'sso-frontend-portal') => [
        'type' => 'public',
        'redirect_uris' => [
            env('SSO_PORTAL_REDIRECT_URI', $frontendUrl.'/auth/callback'),
        ],
        'post_logout_redirect_uris' => [
            env('SSO_PORTAL_POST_LOGOUT_REDIRECT_URI', $frontendUrl),
        ],
        'backchannel_logout_uri' => env('SSO_PORTAL_BACKCHANNEL_LOGOUT_URI'),
        'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access', 'roles', 'permissions'],
    ],
];

if ($loadTestEnabled) {
    $lockedProductionClientIds[] = $loadTestClientId;
    $clients[$loadTestClientId] = [
        'type' => 'confidential',
        'secret' => env('SSO_LOAD_TEST_CLIENT_SECRET_HASH'),
        'secret_expires_at' => env('SSO_LOAD_TEST_CLIENT_SECRET_EXPIRES_AT'),
        'redirect_uris' => [
            env('SSO_LOAD_TEST_REDIRECT_URI', 'https://load-test.timeh.my.id/oauth/callback'),
        ],
        'post_logout_redirect_uris' => [
            env('SSO_LOAD_TEST_POST_LOGOUT_REDIRECT_URI', 'https://load-test.timeh.my.id/signed-out'),
        ],
        'backchannel_logout_uri' => env('SSO_LOAD_TEST_BACKCHANNEL_LOGOUT_URI'),
        'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
    ];
}

return [
    'load_test_client' => [
        'enabled' => $loadTestEnabled,
        'client_id' => $loadTestClientId,
        'secret' => env('SSO_LOAD_TEST_CLIENT_SECRET_HASH'),
        'secret_expires_at' => env('SSO_LOAD_TEST_CLIENT_SECRET_EXPIRES_AT'),
        'redirect_uri' => env('SSO_LOAD_TEST_REDIRECT_URI', 'https://load-test.timeh.my.id/oauth/callback'),
        'post_logout_redirect_uri' => env('SSO_LOAD_TEST_POST_LOGOUT_REDIRECT_URI', 'https://load-test.timeh.my.id/signed-out'),
        'backchannel_logout_uri' => env('SSO_LOAD_TEST_BACKCHANNEL_LOGOUT_URI'),
    ],
    'locked_production_client_ids' => $lockedProductionClientIds,
    'clients' => $clients,
];

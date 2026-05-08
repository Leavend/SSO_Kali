<?php

declare(strict_types=1);

$appUrl = (string) env('APP_URL', 'http://localhost:8200');
$frontendUrl = rtrim((string) env('SSO_FRONTEND_URL', 'http://localhost:3000'), '/');
$loadTestEnabled = (bool) env('SSO_LOAD_TEST_CLIENT_ENABLED', false);
$loadTestClientId = (string) env('SSO_LOAD_TEST_CLIENT_ID', 'sso-load-test-client');

$lockedProductionClientIds = [
    env('APP_A_CLIENT_ID', 'app-a'),
    env('APP_B_CLIENT_ID', 'app-b'),
    env('ADMIN_PANEL_CLIENT_ID', 'sso-admin-panel'),
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
    ],

    env('APP_B_CLIENT_ID', 'app-b') => [
        'type' => 'confidential',
        'secret' => env('APP_B_CLIENT_SECRET_HASH'),
        'redirect_uris' => [
            env('APP_B_REDIRECT_URI', $frontendUrl.'/app-b/auth/callback'),
        ],
        'post_logout_redirect_uris' => [
            env('APP_B_POST_LOGOUT_REDIRECT_URI', $frontendUrl.'/app-b'),
        ],
        'backchannel_logout_uri' => env('APP_B_BACKCHANNEL_LOGOUT_URI'),
    ],

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
    ],
];

if ($loadTestEnabled) {
    $lockedProductionClientIds[] = $loadTestClientId;
    $clients[$loadTestClientId] = [
        'type' => 'confidential',
        'secret' => env('SSO_LOAD_TEST_CLIENT_SECRET_HASH'),
        'redirect_uris' => [
            env('SSO_LOAD_TEST_REDIRECT_URI', 'https://load-test.timeh.my.id/oauth/callback'),
        ],
        'post_logout_redirect_uris' => [
            env('SSO_LOAD_TEST_POST_LOGOUT_REDIRECT_URI', 'https://load-test.timeh.my.id/signed-out'),
        ],
        'backchannel_logout_uri' => env('SSO_LOAD_TEST_BACKCHANNEL_LOGOUT_URI'),
    ];
}

return [
    'load_test_client' => [
        'enabled' => $loadTestEnabled,
        'client_id' => $loadTestClientId,
        'secret' => env('SSO_LOAD_TEST_CLIENT_SECRET_HASH'),
        'redirect_uri' => env('SSO_LOAD_TEST_REDIRECT_URI', 'https://load-test.timeh.my.id/oauth/callback'),
        'post_logout_redirect_uri' => env('SSO_LOAD_TEST_POST_LOGOUT_REDIRECT_URI', 'https://load-test.timeh.my.id/signed-out'),
        'backchannel_logout_uri' => env('SSO_LOAD_TEST_BACKCHANNEL_LOGOUT_URI'),
    ],
    'locked_production_client_ids' => $lockedProductionClientIds,
    'clients' => $clients,
];

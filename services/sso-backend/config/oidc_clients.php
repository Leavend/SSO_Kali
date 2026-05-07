<?php

declare(strict_types=1);

return [
    'clients' => [
        env('ADMIN_PANEL_CLIENT_ID', 'sso-admin-panel') => [
            'type' => 'public',
            'redirect_uris' => [
                env('ADMIN_PANEL_REDIRECT_URI', 'http://localhost:3000/auth/callback'),
            ],
            'post_logout_redirect_uris' => [
                env('ADMIN_PANEL_POST_LOGOUT_REDIRECT_URI', 'http://localhost:3000'),
            ],
            'backchannel_logout_uri' => env(
                'ADMIN_PANEL_BACKCHANNEL_LOGOUT_URI',
                env('APP_URL', 'http://localhost:8200').'/connect/backchannel/admin-panel/logout',
            ),
        ],
    ],
];

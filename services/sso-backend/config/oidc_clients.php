<?php

declare(strict_types=1);

return [
    'clients' => [
        env('APP_A_CLIENT_ID', 'prototype-app-a') => [
            'type' => 'public',
            'redirect_uris' => [
                env('APP_A_REDIRECT_URI', 'http://localhost:3001/auth/callback'),
            ],
            'post_logout_redirect_uris' => [
                env('APP_A_POST_LOGOUT_REDIRECT_URI', 'http://localhost:3001'),
            ],
            'backchannel_logout_uri' => env(
                'APP_A_BACKCHANNEL_LOGOUT_URI',
                'http://localhost:3001/api/backchannel/logout',
            ),
        ],
        env('APP_B_CLIENT_ID', 'prototype-app-b') => [
            'type' => 'confidential',
            // Default is Argon2id hash for 'prototype-secret' and is only for verifier-side storage.
            'secret' => env('APP_B_CLIENT_SECRET_HASH', '$argon2id$v=19$m=65536,t=4,p=2$ZjNtVWMyRU9CaGpXRC9KdQ$aAFtv2QqNWt5R7vaczlAkg8wW9z3Yx8ylFJitt5Tbac'),
            'redirect_uris' => [
                env('APP_B_REDIRECT_URI', 'http://localhost:8300/auth/callback'),
            ],
            'post_logout_redirect_uris' => [
                env('APP_B_POST_LOGOUT_REDIRECT_URI', 'http://localhost:8300'),
            ],
            'backchannel_logout_uri' => env(
                'APP_B_BACKCHANNEL_LOGOUT_URI',
                'http://localhost:8300/auth/backchannel/logout',
            ),
        ],
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

<?php

declare(strict_types=1);

$csv = static fn (string $value): array => array_values(array_filter(array_map('trim', explode(',', $value))));

$credentialedOrigins = static function (string $value, string $fallback) use ($csv): array {
    $origins = $csv($value);

    if (in_array('*', $origins, true)) {
        return $csv($fallback);
    }

    return $origins;
};

return [
    'paths' => [
        'api/*',
        'oauth/*',
        'oauth2/*',
        'token',
        'revocation',
        'userinfo',
        'connect/*',
    ],

    'allowed_methods' => ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => $credentialedOrigins(
        (string) env('SSO_CORS_ALLOWED_ORIGINS', (string) env('SSO_FRONTEND_URL', 'http://localhost:3000')),
        (string) env('SSO_FRONTEND_URL', 'http://localhost:3000'),
    ),

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'X-Requested-With',
        'X-Request-Id',
        'X-XSRF-TOKEN',
    ],

    'exposed_headers' => [
        'X-Request-Id',
    ],

    'max_age' => 600,

    'supports_credentials' => true,
];

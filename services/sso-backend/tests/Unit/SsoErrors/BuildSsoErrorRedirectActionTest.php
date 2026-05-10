<?php

declare(strict_types=1);

use App\Actions\SsoErrors\BuildSsoErrorRedirectAction;
use App\Enums\SsoErrorCode;
use App\Support\SsoErrors\SsoErrorContext;

it('builds a frontend-safe sso error redirect with reference and retry hints', function (): void {
    config(['sso.frontend_url' => 'https://sso.timeh.my.id']);

    $url = app(BuildSsoErrorRedirectAction::class)->execute(
        new SsoErrorContext(
            code: SsoErrorCode::NetworkError,
            safeReason: 'upstream_unavailable',
            technicalReason: 'timeout',
            clientId: 'app-a',
            correlationId: 'req-123',
            retryAllowed: true,
            alternativeLoginAllowed: true,
        ),
        'SSOERR-ABC123',
        '/login',
    );

    expect($url)
        ->toStartWith('https://sso.timeh.my.id/login?')
        ->toContain('error=network_error')
        ->toContain('error_ref=SSOERR-ABC123')
        ->toContain('retry_allowed=1')
        ->toContain('alternative_login_allowed=1')
        ->not->toContain('timeout')
        ->not->toContain('client_secret');
});

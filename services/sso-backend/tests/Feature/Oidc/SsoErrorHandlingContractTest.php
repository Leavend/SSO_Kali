<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    config([
        'sso.frontend_url' => 'https://sso.timeh.my.id',
        'oidc_clients.clients' => [
            'app-a' => [
                'name' => 'App A',
                'type' => 'public',
                'redirect_uris' => ['https://sso.timeh.my.id/app-a/auth/callback'],
                'post_logout_redirect_uris' => ['https://sso.timeh.my.id/app-a'],
                'scopes' => ['openid', 'profile'],
                'active' => true,
            ],
        ],
    ]);
});

it('redirects prompt none login_required to frontend error page with reference', function (): void {
    Log::spy();

    $response = $this->get('/authorize?'.http_build_query([
        'response_type' => 'code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'scope' => 'openid profile',
        'state' => 'state-123',
        'nonce' => 'nonce-123',
        'code_challenge' => str_repeat('a', 43),
        'code_challenge_method' => 'S256',
        'prompt' => 'none',
    ]));

    $response->assertRedirect();
    $location = $response->headers->get('Location');

    expect($location)
        ->toStartWith('https://sso.timeh.my.id/app-a/auth/callback?')
        ->toContain('error=login_required')
        ->toContain('state=state-123')
        ->not->toContain('nonce-123')
        ->not->toContain('code_challenge');

    Log::shouldHaveReceived('warning')->withArgs(fn (string $message, array $context): bool => $message === '[SSO_ERROR_RECORDED]'
        && $context['error_code'] === 'login_required'
        && str_starts_with((string) $context['error_ref'], 'SSOERR-')
    )->once();
});

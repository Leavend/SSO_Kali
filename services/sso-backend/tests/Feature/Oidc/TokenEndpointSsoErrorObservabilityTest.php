<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Log;

beforeEach(function (): void {
    config([
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

it('keeps token endpoint oauth error format while recording fr007 error reference', function (): void {
    Log::spy();

    $response = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'app-a',
        'redirect_uri' => 'https://sso.timeh.my.id/app-a/auth/callback',
        'code' => 'expired-code',
        'code_verifier' => 'secret-verifier-material',
    ], [
        'X-Request-Id' => 'req-token-123',
    ]);

    $response->assertStatus(400)
        ->assertJson([
            'error' => 'invalid_grant',
            'error_description' => 'The authorization code is invalid.',
        ])
        ->assertHeader('Pragma', 'no-cache');

    Log::shouldHaveReceived('warning')->withArgs(function (string $message, array $context): bool {
        $encoded = json_encode($context, JSON_THROW_ON_ERROR);

        return $message === '[SSO_ERROR_RECORDED]'
            && $context['error_code'] === 'invalid_grant'
            && $context['correlation_id'] === 'req-token-123'
            && str_starts_with((string) $context['error_ref'], 'SSOERR-')
            && ! str_contains($encoded, 'expired-code')
            && ! str_contains($encoded, 'secret-verifier-material');
    })->once();
});

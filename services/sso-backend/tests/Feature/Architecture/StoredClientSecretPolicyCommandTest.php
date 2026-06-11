<?php

declare(strict_types=1);

use App\Services\Oidc\DownstreamClientRegistry;
use Tests\TestCase;

if (! function_exists('storedClientSecretPolicyClients')) {
    function storedClientSecretPolicyClients(?string $secret, ?string $expiresAt): array
    {
        return [
            'app-a' => [
                'type' => 'public',
                'redirect_uris' => ['https://sso.example.test/app-a/callback'],
                'post_logout_redirect_uris' => ['https://sso.example.test/app-a'],
            ],
            'app-b' => [
                'type' => 'confidential',
                'secret' => $secret,
                'secret_expires_at' => $expiresAt,
                'redirect_uris' => ['https://sso.example.test/app-b/callback'],
                'post_logout_redirect_uris' => ['https://sso.example.test/app-b'],
            ],
        ];
    }
}

it('passes the stored client secret policy command for compliant hashes and lifecycle metadata', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients', storedClientSecretPolicyClients(COMPLIANT_TEST_CLIENT_SECRET_HASH, now()->addDays(90)->toIso8601String()));
    app(DownstreamClientRegistry::class)->flush();

    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Verified 1 confidential client secret hash(es).')
        ->assertSuccessful();
});

it('fails the stored client secret policy command when production lifecycle metadata is missing', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients', storedClientSecretPolicyClients(COMPLIANT_TEST_CLIENT_SECRET_HASH, null));
    app(DownstreamClientRegistry::class)->flush();

    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Production confidential client [app-b] is missing secret_expires_at lifecycle metadata.')
        ->assertFailed();
});

it('fails the stored client secret policy command for plaintext secrets', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients', storedClientSecretPolicyClients('prototype-secret', now()->addDays(90)->toIso8601String()));
    app(DownstreamClientRegistry::class)->flush();

    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Confidential client [app-b] has a non-compliant verifier secret hash.')
        ->assertFailed();
});

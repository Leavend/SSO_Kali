<?php

declare(strict_types=1);

use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;

const COMPLIANT_TEST_CLIENT_SECRET_HASH = '$argon2id$v=19$m=19456,t=3,p=1$LjdEd3dSZERUcjdtcGJhTA$69AablhTFZNWAg7DFVgO7aok3D9GXKESsp2iCnpwpsg';

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

it('stores confidential oidc client secrets as argon2id hashes', function (): void {
    config()->set('oidc_clients.clients.app-b.secret', COMPLIANT_TEST_CLIENT_SECRET_HASH);
    config()->set('oidc_clients.clients.sso-admin-panel.secret', COMPLIANT_TEST_CLIENT_SECRET_HASH);
    config()->set('oidc_clients.clients.sso-frontend-portal.secret', COMPLIANT_TEST_CLIENT_SECRET_HASH);

    $policy = app(ClientSecretHashPolicy::class);
    $clients = config('oidc_clients.clients', []);

    foreach ($clients as $config) {
        if (! is_array($config) || ($config['type'] ?? null) !== 'confidential') {
            continue;
        }

        $secret = $config['secret'] ?? null;

        expect($secret)->toBeString()->toStartWith('$argon2id$');
        $policy->assertCompliantHash((string) $secret);
    }
});

it('verifies configured confidential client secrets at runtime', function (): void {
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients', storedClientSecretPolicyClients(COMPLIANT_TEST_CLIENT_SECRET_HASH, now()->addDays(90)->toIso8601String()));
    app(DownstreamClientRegistry::class)->flush();

    expect(app(DownstreamClientRegistry::class)->assertStoredSecretsCompliant())->toBe(1);
});

it('fails production verification when a static confidential client is missing secret expiry metadata', function (): void {
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients', storedClientSecretPolicyClients(COMPLIANT_TEST_CLIENT_SECRET_HASH, null));
    app(DownstreamClientRegistry::class)->flush();

    expect(fn () => app(DownstreamClientRegistry::class)->assertStoredSecretsCompliant())
        ->toThrow(RuntimeException::class, 'missing secret_expires_at lifecycle metadata');
});

it('hashes plaintext config secrets at the server boundary before verification', function (): void {
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients', storedClientSecretPolicyClients('prototype-secret', now()->addDays(90)->toIso8601String()));
    app(DownstreamClientRegistry::class)->flush();

    $client = app(DownstreamClientRegistry::class)->find('app-b');

    expect($client)->not->toBeNull()
        ->and($client?->secret)->toStartWith('$argon2id$')
        ->and(app(DownstreamClientRegistry::class)->validSecret($client, 'prototype-secret'))->toBeTrue();
});

it('reads confidential verifier secrets from hash-specific env bindings', function (): void {
    $config = file_get_contents(base_path('config/oidc_clients.php'));
    $example = file_get_contents(base_path('.env.example'));

    expect($config)->toContain("env('APP_B_CLIENT_SECRET_HASH'")
        ->and($config)->toContain("env('APP_B_CLIENT_SECRET_EXPIRES_AT'")
        ->and($config)->not->toContain("env('APP_B_CLIENT_SECRET'")
        ->and($example)->toContain('APP_B_CLIENT_SECRET_HASH=$argon2id$')
        ->and($example)->toContain('APP_B_CLIENT_SECRET_EXPIRES_AT=');
});

it('reads first-party BFF plaintext secrets only from server-side env bindings', function (): void {
    $config = file_get_contents(base_path('config/oidc_clients.php'));

    expect($config)->toContain("env('SSO_PORTAL_CLIENT_SECRET')")
        ->and($config)->toContain("env('ADMIN_PANEL_CLIENT_SECRET')")
        ->and($config)->not->toContain('VITE_SSO_PORTAL_CLIENT_SECRET')
        ->and($config)->not->toContain('VITE_ADMIN_PANEL_CLIENT_SECRET');
});

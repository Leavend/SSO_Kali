<?php

declare(strict_types=1);

beforeEach(function (): void {
    $this->markTestSkipped('Legacy static dummy-client/broker endpoint test deprecated by FR-001 native Passport admin-panel-only scope.');
});

use App\Services\Oidc\DownstreamClientRegistry;
use App\Support\Security\ClientSecretHashPolicy;

it('stores confidential oidc client secrets as argon2id hashes', function (): void {
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
    expect(app(DownstreamClientRegistry::class)->assertStoredSecretsCompliant())->toBe(1);
});

it('fails runtime verification when a stored verifier secret is plaintext', function (): void {
    config()->set('oidc_clients.clients.prototype-app-b.secret', 'prototype-secret');

    expect(fn () => app(DownstreamClientRegistry::class)->assertStoredSecretsCompliant())
        ->toThrow(RuntimeException::class, 'non-compliant verifier secret hash');
});

it('reads confidential verifier secrets from hash-specific env bindings', function (): void {
    $config = file_get_contents(base_path('config/oidc_clients.php'));
    $example = file_get_contents(base_path('.env.example'));

    expect($config)->toContain("env('APP_B_CLIENT_SECRET_HASH'");
    expect($config)->not->toContain("env('APP_B_CLIENT_SECRET'");
    expect($example)->toContain('APP_B_CLIENT_SECRET_HASH=$argon2id$');
});

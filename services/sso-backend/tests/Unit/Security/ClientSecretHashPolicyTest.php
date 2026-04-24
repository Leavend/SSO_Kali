<?php

declare(strict_types=1);

use App\Support\Security\ClientSecretHashPolicy;

beforeEach(function (): void {
    config()->set('sso.client_secret_hash.memory_cost', 65536);
    config()->set('sso.client_secret_hash.time_cost', 4);
    config()->set('sso.client_secret_hash.threads', 2);
});

it('creates argon2id hashes that satisfy the policy', function (): void {
    $policy = app(ClientSecretHashPolicy::class);
    $hash = $policy->make('prototype-secret');

    expect($hash)->toStartWith('$argon2id$');

    $policy->assertCompliantHash($hash);
    expect($policy->verify('prototype-secret', $hash))->toBeTrue();
});

it('rejects plaintext stored client secrets', function (): void {
    $policy = app(ClientSecretHashPolicy::class);

    expect(fn (): bool => tap(true, fn () => $policy->assertCompliantHash('prototype-secret')))
        ->toThrow(RuntimeException::class, 'Stored client secret must use an Argon2id hash.');
});

it('rejects argon2id hashes below the policy baseline', function (): void {
    $hash = password_hash('prototype-secret', PASSWORD_ARGON2ID, [
        'memory_cost' => 8192,
        'time_cost' => 1,
        'threads' => 1,
    ]);

    expect($hash)->toBeString();

    $policy = app(ClientSecretHashPolicy::class);

    expect(fn (): bool => tap(true, fn () => $policy->assertCompliantHash((string) $hash)))
        ->toThrow(RuntimeException::class, 'Stored client secret memory_cost is below policy.');
});

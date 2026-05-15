<?php

declare(strict_types=1);

use Tests\TestCase;

it('passes the stored client secret policy command for compliant hashes and lifecycle metadata', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients.app-b.secret', COMPLIANT_TEST_CLIENT_SECRET_HASH);
    config()->set('oidc_clients.clients.app-b.secret_expires_at', now()->addDays(90)->toIso8601String());

    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Verified 1 confidential client secret hash(es).')
        ->assertSuccessful();
});

it('fails the stored client secret policy command when production lifecycle metadata is missing', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients.app-b.secret', COMPLIANT_TEST_CLIENT_SECRET_HASH);
    config()->set('oidc_clients.clients.app-b.secret_expires_at', null);

    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Production confidential client [app-b] is missing secret_expires_at lifecycle metadata.')
        ->assertFailed();
});

it('fails the stored client secret policy command for plaintext secrets', function (): void {
    /** @var TestCase $this */
    config()->set('app.env', 'production');
    config()->set('oidc_clients.clients.app-b.secret', 'prototype-secret');
    config()->set('oidc_clients.clients.app-b.secret_expires_at', now()->addDays(90)->toIso8601String());

    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Confidential client [app-b] has a non-compliant verifier secret hash.')
        ->assertFailed();
});

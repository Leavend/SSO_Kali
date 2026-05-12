<?php

declare(strict_types=1);

beforeEach(function (): void {
    $this->markTestSkipped('Legacy static dummy-client/SSO endpoint test deprecated by Production Client Registry native Passport admin-panel-only scope.');
});

use Tests\TestCase;

it('passes the stored client secret policy command for compliant hashes', function (): void {
    /** @var TestCase $this */
    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Verified 1 confidential client secret hash(es).')
        ->assertSuccessful();
});

it('fails the stored client secret policy command for plaintext secrets', function (): void {
    /** @var TestCase $this */
    config()->set('oidc_clients.clients.prototype-app-b.secret', 'prototype-secret');

    $this->artisan('oidc:verify-client-secret-policy')
        ->expectsOutputToContain('Confidential client [prototype-app-b] has a non-compliant verifier secret hash.')
        ->assertFailed();
});

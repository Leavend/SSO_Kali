<?php

declare(strict_types=1);

beforeEach(function (): void {
    $this->markTestSkipped('Legacy static dummy-client/SSO endpoint test deprecated by Production Client Registry native Passport admin-panel-only scope.');
});

use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
});

it('allows token requests when the presented origin matches the client redirect origin', function (): void {
    /** @var TestCase $this */
    $this->postJson('/token', authorizationCodePayload(), [
        'Origin' => 'http://localhost:3001',
    ])->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

it('rejects token requests when the presented origin is not allowed for the client', function (): void {
    /** @var TestCase $this */
    $this->postJson('/token', authorizationCodePayload(), [
        'Origin' => 'https://evil.example',
    ])->assertStatus(403)
        ->assertJsonPath('error', 'invalid_request')
        ->assertJsonPath('error_description', 'Origin is not allowed for this client.');
});

it('allows server-to-server token requests without origin headers', function (): void {
    /** @var TestCase $this */
    $this->postJson('/token', authorizationCodePayload())
        ->assertStatus(400)
        ->assertJsonPath('error', 'invalid_grant');
});

/**
 * @return array<string, string>
 */
function authorizationCodePayload(): array
{
    return [
        'grant_type' => 'authorization_code',
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'code' => 'missing-code',
        'code_verifier' => 'missing-verifier',
    ];
}

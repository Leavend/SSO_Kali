<?php

declare(strict_types=1);

use App\Support\Security\ClientSecretHashPolicy;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('oidc_clients.clients', [
        'origin-policy-public-client' => [
            'type' => 'public',
            'redirect_uris' => ['http://localhost:3001/auth/callback'],
            'post_logout_redirect_uris' => ['http://localhost:3001'],
        ],
        'origin-policy-confidential-client' => [
            'type' => 'confidential',
            'secret' => app(ClientSecretHashPolicy::class)->make('origin-policy-secret'),
            'redirect_uris' => ['http://localhost:8300/auth/callback'],
            'post_logout_redirect_uris' => ['http://localhost:8300'],
        ],
    ]);
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

it('applies origin checks to confidential clients authenticated with HTTP Basic', function (): void {
    /** @var TestCase $this */
    $credentials = base64_encode('origin-policy-confidential-client:origin-policy-secret');

    $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'redirect_uri' => 'http://localhost:8300/auth/callback',
        'code' => 'missing-code',
        'code_verifier' => 'missing-verifier',
    ], [
        'Authorization' => 'Basic '.$credentials,
        'Origin' => 'https://evil.example',
    ])->assertStatus(403)
        ->assertJsonPath('error', 'invalid_request')
        ->assertJsonPath('error_description', 'Origin is not allowed for this client.');
});

/**
 * @return array<string, string>
 */
function authorizationCodePayload(): array
{
    return [
        'grant_type' => 'authorization_code',
        'client_id' => 'origin-policy-public-client',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'code' => 'missing-code',
        'code_verifier' => 'missing-verifier',
    ];
}

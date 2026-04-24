<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\Oidc\LocalTokenService;
use App\Support\Oidc\Pkce;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('session.driver', 'array');
    config()->set('session.cookie', '__Host-broker_session');
    config()->set('session.secure', true);
    config()->set('session.path', '/');
    config()->set('session.domain', null);
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.resource_audience', 'sso-resource-api');
    config()->set('sso.signing.private_key_path', storage_path('app/testing/oidc/private.pem'));
    config()->set('sso.signing.public_key_path', storage_path('app/testing/oidc/public.pem'));
    config()->set('sso.broker.public_issuer', 'https://zitadel.example');
    config()->set('sso.broker.internal_issuer', 'https://zitadel.example');
    config()->set('sso.broker.client_id', 'broker-client');
    config()->set('sso.broker.client_secret', 'broker-secret');
    config()->set('sso.broker.redirect_uri', 'http://localhost/callbacks/zitadel');
    config()->set('sso.admin.session_management_roles', ['admin']);
    config()->set('sso.admin.mfa.enforced', false);
});

it('marks authorize redirects as no-store', function (): void {
    /** @var TestCase $this */
    Http::fake([
        'https://zitadel.example/.well-known/openid-configuration' => Http::response([
            'authorization_endpoint' => 'https://zitadel.example/oauth/v2/authorize',
        ], 200),
    ]);

    $response = $this->get('/authorize?'.http_build_query(noStoreAuthorizeParams()));

    $response->assertRedirect();
    assertNoStoreHeaders($response);
});

it('marks callback failures as no-store', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/callbacks/zitadel?state=missing-state&code=missing-code');

    $response->assertRedirectContains('/?error=session_expired');

    assertNoStoreHeaders($response);
});

it('redirects expired browser callbacks back to the downstream callback when a fallback cookie exists', function (): void {
    /** @var TestCase $this */
    $this->withoutMiddleware(EncryptCookies::class);

    $response = $this
        ->withUnencryptedCookies([
            '__Host-broker_auth_flow' => json_encode([
                'client_id' => 'sso-admin-panel',
                'redirect_uri' => 'http://localhost:3000/auth/callback',
                'original_state' => 'client-state',
            ], JSON_THROW_ON_ERROR),
        ])
        ->get('/callbacks/zitadel?state=missing-state&code=missing-code');

    $response->assertRedirectContains('http://localhost:3000/auth/callback')
        ->assertRedirectContains('error=invalid_request')
        ->assertRedirectContains('state=client-state');

    assertNoStoreHeaders($response);
});

it('marks the admin principal bootstrap endpoint as no-store', function (): void {
    /** @var TestCase $this */
    $admin = User::factory()->create([
        'subject_id' => 'admin-no-store',
        'subject_uuid' => 'admin-no-store',
        'role' => 'admin',
    ]);

    $response = $this->withToken(noStoreAdminPanelAccessToken($admin))
        ->getJson('/admin/api/me');

    $response->assertOk();
    assertNoStoreHeaders($response);
});

/**
 * @return array<string, string>
 */
function noStoreAuthorizeParams(): array
{
    return [
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ];
}

function noStoreAdminPanelAccessToken(User $user): string
{
    $tokens = app(LocalTokenService::class)->issue([
        'client_id' => 'sso-admin-panel',
        'scope' => 'openid profile email',
        'session_id' => 'admin-session-'.$user->subject_id,
        'subject_id' => $user->subject_id,
        'auth_time' => now()->subMinute()->timestamp,
        'amr' => ['pwd', 'mfa'],
        'acr' => 'urn:example:loa:2',
    ]);

    return (string) $tokens['access_token'];
}

function assertNoStoreHeaders(TestResponse $response): void
{
    $cacheControl = (string) $response->headers->get('Cache-Control');

    expect($cacheControl)->toContain('no-store')
        ->toContain('no-cache')
        ->toContain('private')
        ->toContain('max-age=0')
        ->toContain('must-revalidate')
        ->and($response->headers->get('Pragma'))->toBe('no-cache')
        ->and($response->headers->get('Expires'))->toBe('0')
        ->and($response->headers->get('Surrogate-Control'))->toBe('no-store')
        ->and((string) $response->headers->get('Vary'))->toContain('Authorization')
        ->and((string) $response->headers->get('Vary'))->toContain('Cookie');
}

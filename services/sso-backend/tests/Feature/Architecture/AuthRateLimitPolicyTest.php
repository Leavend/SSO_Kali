<?php

declare(strict_types=1);

use App\Models\User;
use App\Providers\AppServiceProvider;
use App\Services\Oidc\LocalTokenService;
use App\Support\Oidc\BrokerAuthFlowCookie;
use App\Support\Oidc\Pkce;
use Illuminate\Support\Facades\Http;
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
});

it('throttles authorize requests per source IP', function (): void {
    /** @var TestCase $this */
    config()->set('sso.rate_limits.authorize_per_minute', 2);
    (new AppServiceProvider(app()))->boot();

    Http::fake([
        'https://zitadel.example/.well-known/openid-configuration' => Http::response([
            'authorization_endpoint' => 'https://zitadel.example/oauth/v2/authorize',
        ], 200),
    ]);

    $request = $this->withServerVariables(['REMOTE_ADDR' => '10.10.10.10']);

    $request->get('/authorize?'.http_build_query(rateLimitAuthorizeParams()))->assertRedirect();
    $request->get('/authorize?'.http_build_query(rateLimitAuthorizeParams(['state' => 'second-state'])))->assertRedirect();
    $response = $request->get('/authorize?'.http_build_query(rateLimitAuthorizeParams(['state' => 'third-state'])));

    $response->assertRedirect();
    expect((string) $response->headers->get('Location'))
        ->toContain('http://localhost:3001/auth/callback?')
        ->toContain('error=too_many_attempts')
        ->toContain('state=third-state');
});

it('throttles admin bootstrap requests independently from general admin reads', function (): void {
    /** @var TestCase $this */
    config()->set('sso.rate_limits.admin_bootstrap_per_minute', 1);
    (new AppServiceProvider(app()))->boot();

    $admin = User::factory()->create([
        'subject_id' => 'admin-rate-limit',
        'subject_uuid' => 'admin-rate-limit',
        'role' => 'admin',
    ]);

    $token = rateLimitAdminAccessToken($admin);

    $request = $this->withServerVariables(['REMOTE_ADDR' => '10.10.10.11'])
        ->withToken($token);

    $request->getJson('/admin/api/me')->assertOk();
    $request->getJson('/admin/api/me')
        ->assertStatus(429)
        ->assertJsonPath('error', 'too_many_attempts')
        ->assertJsonPath('error_description', 'Too many attempts were detected. Please wait a moment before trying again.');
});

it('redirects throttled broker callbacks back to the downstream client', function (): void {
    /** @var TestCase $this */
    config()->set('sso.rate_limits.callback_per_minute', 1);
    (new AppServiceProvider(app()))->boot();

    $request = $this->withServerVariables(['REMOTE_ADDR' => '10.10.10.12'])
        ->withCookie(BrokerAuthFlowCookie::NAME, json_encode([
            'client_id' => 'sso-admin-panel',
            'redirect_uri' => 'http://localhost:3000/auth/callback',
            'original_state' => 'client-state',
        ], JSON_THROW_ON_ERROR));

    $request->get('/callbacks/zitadel?state=expired-state')->assertRedirect();

    $response = $request->get('/callbacks/zitadel?state=expired-state');

    $response->assertRedirect();
    expect((string) $response->headers->get('Location'))
        ->toContain('http://localhost:3000/auth/callback?')
        ->toContain('error=too_many_attempts')
        ->toContain('state=client-state');
});

/**
 * @param  array<string, string>  $replace
 * @return array<string, string>
 */
function rateLimitAuthorizeParams(array $replace = []): array
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
        ...$replace,
    ];
}

function rateLimitAdminAccessToken(User $user): string
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

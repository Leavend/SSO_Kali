<?php

declare(strict_types=1);

use App\Jobs\DispatchBackChannelLogoutJob;
use App\Services\Oidc\AccessTokenGuard;
use App\Services\Oidc\LocalTokenService;
use App\Services\Oidc\LogoutOutcomeMetrics;
use App\Services\Oidc\LogoutTokenService;
use App\Support\Oidc\Pkce;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\Support\FakeUpstreamOidc;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('sso.base_url', 'http://localhost');
    config()->set('sso.issuer', 'http://localhost');
    config()->set('sso.broker.public_issuer', 'https://zitadel.example');
    config()->set('sso.broker.internal_issuer', 'https://zitadel.example');
    config()->set('sso.broker.client_id', 'broker-client');
    config()->set('sso.broker.client_secret', 'broker-secret');
    config()->set('sso.broker.redirect_uri', 'http://localhost/callbacks/zitadel');
    config()->set('oidc_clients.clients.prototype-app-a.backchannel_logout_uri', 'https://app-a.example/api/backchannel/logout');
    config()->set('oidc_clients.clients.prototype-app-b.backchannel_logout_uri', 'https://app-b.example/auth/backchannel/logout');
    config()->set('oidc_clients.clients.sso-admin-panel.backchannel_logout_uri', 'http://localhost/connect/backchannel/admin-panel/logout');
    Cache::flush();
});

it('registers client sessions and fans out back-channel logout by sid', function (): void {
    /** @var TestCase $this */
    Queue::fake();

    Http::fake([
        'https://zitadel.example/.well-known/openid-configuration' => Http::response([
            'authorization_endpoint' => 'https://zitadel.example/oauth/v2/authorize',
            'token_endpoint' => 'https://zitadel.example/oauth/v2/token',
            'userinfo_endpoint' => 'https://zitadel.example/oidc/v1/userinfo',
            'revocation_endpoint' => 'https://zitadel.example/oauth/v2/revoke',
        ], 200),
        'https://app-a.example/api/backchannel/logout' => Http::response([], 200),
        'https://app-b.example/auth/backchannel/logout' => Http::response([], 200),
        'http://localhost/connect/backchannel/admin-panel/logout' => Http::response([], 200),
    ]);

    $appATokens = issueLocalTokens(
        case: $this,
        clientId: 'prototype-app-a',
        redirectUri: 'http://localhost:3001/auth/callback',
        codeVerifier: 'client-a-verifier',
    );
    $appBTokens = issueSiblingLocalTokens(
        accessToken: (string) $appATokens['access_token'],
        clientId: 'prototype-app-b',
    );
    $adminTokens = issueSiblingLocalTokens(
        accessToken: (string) $appATokens['access_token'],
        clientId: 'sso-admin-panel',
    );

    $this->withToken((string) $appATokens['access_token'])
        ->postJson('/connect/register-session')
        ->assertOk()
        ->assertJsonPath('registered', true)
        ->assertJsonPath('client_id', 'prototype-app-a');

    $this->withToken((string) $appBTokens['access_token'])
        ->postJson('/connect/register-session')
        ->assertOk()
        ->assertJsonPath('client_id', 'prototype-app-b');

    $logout = $this->withToken((string) $appATokens['access_token'])
        ->postJson('/connect/logout');

    $logout
        ->assertOk()
        ->assertJsonPath('signed_out', true)
        ->assertJsonCount(3, 'notifications');

    Queue::assertPushed(DispatchBackChannelLogoutJob::class, 3);
    Queue::assertPushed(
        DispatchBackChannelLogoutJob::class,
        fn (DispatchBackChannelLogoutJob $job): bool => $job->logoutUri === 'https://app-a.example/api/backchannel/logout',
    );
    Queue::assertPushed(
        DispatchBackChannelLogoutJob::class,
        fn (DispatchBackChannelLogoutJob $job): bool => $job->logoutUri === 'https://app-b.example/auth/backchannel/logout',
    );
    Queue::assertPushed(
        DispatchBackChannelLogoutJob::class,
        fn (DispatchBackChannelLogoutJob $job): bool => $job->logoutUri === 'http://localhost/connect/backchannel/admin-panel/logout',
    );

    $this->getJson('/userinfo', [
        'Authorization' => 'Bearer '.$appATokens['access_token'],
    ])->assertStatus(401);

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'prototype-app-a',
        'refresh_token' => $appATokens['refresh_token'],
    ])->assertStatus(400);

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'prototype-app-b',
        'client_secret' => 'prototype-secret',
        'refresh_token' => $appBTokens['refresh_token'],
    ])->assertStatus(400);

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'sso-admin-panel',
        'refresh_token' => $adminTokens['refresh_token'],
    ])->assertStatus(400);

    $metrics = app(LogoutOutcomeMetrics::class);

    expect($metrics->successTotal())->toBe(1)
        ->and($metrics->failureTotal())->toBe(0);
});

it('records logout failures for invalid bearer tokens', function (): void {
    /** @var TestCase $this */
    $this->postJson('/connect/logout')->assertStatus(401);

    $metrics = app(LogoutOutcomeMetrics::class);

    expect($metrics->successTotal())->toBe(0)
        ->and($metrics->failureTotal())->toBe(1)
        ->and($metrics->failureCount('invalid_token'))->toBe(1);
});

it('revokes admin-panel sessions through the internal back-channel logout endpoint', function (): void {
    /** @var TestCase $this */
    $tokens = issueLocalTokens(
        case: $this,
        clientId: 'sso-admin-panel',
        redirectUri: 'http://localhost:3000/auth/callback',
        codeVerifier: 'admin-panel-verifier',
    );
    $claims = app(AccessTokenGuard::class)->claimsFrom((string) $tokens['access_token']);
    $logoutToken = app(LogoutTokenService::class)->issue(
        'sso-admin-panel',
        (string) $claims['sub'],
        (string) $claims['sid'],
    );

    $this->postJson('/connect/backchannel/admin-panel/logout', [
        'logout_token' => $logoutToken,
    ])->assertOk()
        ->assertJsonPath('logged_out', true)
        ->assertJsonPath('client_id', 'sso-admin-panel')
        ->assertJsonPath('sessions_revoked', 1);

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'sso-admin-panel',
        'refresh_token' => $tokens['refresh_token'],
    ])->assertStatus(400);
});

/**
 * @return array<string, mixed>
 */
function issueLocalTokens(
    TestCase $case,
    string $clientId,
    string $redirectUri,
    string $codeVerifier,
    ?string $clientSecret = null,
): array {
    $authorize = $case->get('/authorize?'.http_build_query([
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => 'phase-three-state',
        'nonce' => 'phase-three-nonce',
        'code_challenge' => Pkce::challengeFrom($codeVerifier),
        'code_challenge_method' => 'S256',
    ]));

    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $authorizeQuery);

    Http::fake([
        'https://zitadel.example/.well-known/openid-configuration' => Http::response([
            'authorization_endpoint' => 'https://zitadel.example/oauth/v2/authorize',
            'token_endpoint' => 'https://zitadel.example/oauth/v2/token',
            'userinfo_endpoint' => 'https://zitadel.example/oidc/v1/userinfo',
            'revocation_endpoint' => 'https://zitadel.example/oauth/v2/revoke',
        ], 200),
        'https://zitadel.example/oauth/v2/token' => Http::response([
            'access_token' => 'upstream-access-token',
            'refresh_token' => 'upstream-refresh-token',
            'id_token' => FakeUpstreamOidc::idToken((string) $authorizeQuery['nonce']),
            'token_type' => 'Bearer',
            'expires_in' => 3600,
        ], 200),
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
        'https://zitadel.example/oidc/v1/userinfo' => Http::response([
            'sub' => '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c',
            'name' => 'Ada Lovelace',
            'given_name' => 'Ada',
            'family_name' => 'Lovelace',
            'email' => 'ada@example.com',
            'email_verified' => true,
        ], 200),
        'https://zitadel.example/oauth/v2/revoke' => Http::response([], 200),
        'https://app-a.example/api/backchannel/logout' => Http::response([], 200),
        'https://app-b.example/auth/backchannel/logout' => Http::response([], 200),
    ]);

    $callback = $case->get('/callbacks/zitadel?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $authorizeQuery['state'],
    ]));

    parse_str((string) parse_url((string) $callback->headers->get('Location'), PHP_URL_QUERY), $callbackQuery);

    $tokenRequest = array_filter([
        'grant_type' => 'authorization_code',
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'code' => $callbackQuery['code'],
        'code_verifier' => $codeVerifier,
        'client_secret' => $clientSecret,
    ], static fn (?string $value): bool => $value !== null);

    return $case->postJson('/token', $tokenRequest)->json();
}

/**
 * @return array<string, mixed>
 */
function issueSiblingLocalTokens(string $accessToken, string $clientId): array
{
    $claims = app(AccessTokenGuard::class)->claimsFrom($accessToken);

    return app(LocalTokenService::class)->issue([
        'client_id' => $clientId,
        'scope' => 'openid profile email offline_access',
        'session_id' => (string) $claims['sid'],
        'subject_id' => (string) $claims['sub'],
        'upstream_refresh_token' => null,
    ]);
}

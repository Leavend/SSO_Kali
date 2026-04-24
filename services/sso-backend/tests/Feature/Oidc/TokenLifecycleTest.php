<?php

declare(strict_types=1);

use App\Support\Oidc\Pkce;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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
});

it('issues local tokens, rotates refresh tokens, and revokes them', function (): void {
    /** @var TestCase $this */
    Http::fake([
        'https://zitadel.example/.well-known/openid-configuration' => Http::response([
            'authorization_endpoint' => 'https://zitadel.example/oauth/v2/authorize',
            'token_endpoint' => 'https://zitadel.example/oauth/v2/token',
            'userinfo_endpoint' => 'https://zitadel.example/oidc/v1/userinfo',
            'revocation_endpoint' => 'https://zitadel.example/oauth/v2/revoke',
        ], 200),
    ]);

    $codeVerifier = 'client-verifier';
    $authorize = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => 'phase-two-state',
        'nonce' => 'phase-two-nonce',
        'code_challenge' => Pkce::challengeFrom($codeVerifier),
        'code_challenge_method' => 'S256',
    ]));

    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $authorizeQuery);

    Http::fake([
        'https://zitadel.example/oauth/v2/token' => Http::sequence()
            ->push([
                'access_token' => 'upstream-access-token',
                'refresh_token' => 'upstream-refresh-token',
                'id_token' => FakeUpstreamOidc::idToken((string) $authorizeQuery['nonce']),
                'token_type' => 'Bearer',
                'expires_in' => 3600,
            ], 200)
            ->push([
                'access_token' => 'upstream-access-token-2',
                'refresh_token' => 'upstream-refresh-token-2',
                'id_token' => FakeUpstreamOidc::idToken('phase-two-refresh'),
                'token_type' => 'Bearer',
                'expires_in' => 3600,
            ], 200),
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
        'https://zitadel.example/oidc/v1/userinfo' => Http::sequence()
            ->push([
                'sub' => '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c',
                'name' => 'Ada Lovelace',
                'given_name' => 'Ada',
                'family_name' => 'Lovelace',
                'email' => 'ada@example.com',
                'email_verified' => true,
            ], 200)
            ->push([
                'sub' => '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c',
                'name' => 'Ada Lovelace',
                'given_name' => 'Ada',
                'family_name' => 'Lovelace',
                'email' => 'ada@example.com',
                'email_verified' => true,
            ], 200),
        'https://zitadel.example/oauth/v2/revoke' => Http::response([], 200),
    ]);

    $callback = $this->get('/callbacks/zitadel?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $authorizeQuery['state'],
    ]));

    parse_str((string) parse_url((string) $callback->headers->get('Location'), PHP_URL_QUERY), $callbackQuery);

    $tokenResponse = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'code' => $callbackQuery['code'],
        'code_verifier' => $codeVerifier,
    ]);

    $tokenResponse
        ->assertOk()
        ->assertJsonStructure(['access_token', 'id_token', 'refresh_token', 'token_type', 'expires_in', 'scope']);

    $tokenPayload = $tokenResponse->json();

    $this->getJson('/userinfo', [
        'Authorization' => 'Bearer '.$tokenPayload['access_token'],
    ])
        ->assertOk()
        ->assertJsonPath('sub', '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c')
        ->assertJsonPath('email', 'ada@example.com');

    $this->getJson('/userinfo', [
        'Authorization' => 'Bearer '.$tokenPayload['id_token'],
    ])->assertStatus(401);

    $this->getJson('/api/profile', [
        'Authorization' => 'Bearer '.$tokenPayload['access_token'],
    ])
        ->assertOk()
        ->assertJsonPath('resource_profile.subject_id', '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c')
        ->assertJsonPath('resource_profile.display_name', 'Ada Lovelace');

    $refreshResponse = $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'prototype-app-a',
        'refresh_token' => $tokenPayload['refresh_token'],
    ]);

    $refreshResponse->assertOk();
    $refreshPayload = $refreshResponse->json();

    expect($refreshPayload['refresh_token'])->not->toBe($tokenPayload['refresh_token']);

    $this->postJson('/revocation', [
        'client_id' => 'prototype-app-a',
        'token' => $refreshPayload['refresh_token'],
        'token_type_hint' => 'refresh_token',
    ])->assertOk();

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'prototype-app-a',
        'refresh_token' => $refreshPayload['refresh_token'],
    ])->assertStatus(400);
});

it('rejects refresh token rotation when the token family exceeds the absolute lifetime', function (): void {
    /** @var TestCase $this */
    config()->set('sso.ttl.refresh_token_family_days', 90);

    Http::fake([
        'https://zitadel.example/.well-known/openid-configuration' => Http::response([
            'authorization_endpoint' => 'https://zitadel.example/oauth/v2/authorize',
            'token_endpoint' => 'https://zitadel.example/oauth/v2/token',
            'userinfo_endpoint' => 'https://zitadel.example/oidc/v1/userinfo',
            'revocation_endpoint' => 'https://zitadel.example/oauth/v2/revoke',
        ], 200),
    ]);

    $codeVerifier = 'family-expiry-verifier';
    $authorize = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email offline_access',
        'state' => 'family-expiry-state',
        'nonce' => 'family-expiry-nonce',
        'code_challenge' => Pkce::challengeFrom($codeVerifier),
        'code_challenge_method' => 'S256',
    ]));

    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $authorizeQuery);

    Http::fake([
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
    ]);

    $callback = $this->get('/callbacks/zitadel?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $authorizeQuery['state'],
    ]));

    parse_str((string) parse_url((string) $callback->headers->get('Location'), PHP_URL_QUERY), $callbackQuery);

    $tokenPayload = $this->postJson('/token', [
        'grant_type' => 'authorization_code',
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'code' => $callbackQuery['code'],
        'code_verifier' => $codeVerifier,
    ])->assertOk()->json();

    DB::table('refresh_token_rotations')->update([
        'family_created_at' => now()->subDays(91),
    ]);

    $this->postJson('/token', [
        'grant_type' => 'refresh_token',
        'client_id' => 'prototype-app-a',
        'refresh_token' => $tokenPayload['refresh_token'],
    ])->assertStatus(400);

    expect(DB::table('refresh_token_rotations')->whereNotNull('revoked_at')->count())->toBe(1);
});

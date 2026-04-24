<?php

declare(strict_types=1);

use App\Services\Oidc\AuthRequestStore;
use App\Services\Oidc\OidcProfileMetrics;
use App\Support\Oidc\Pkce;
use Illuminate\Support\Facades\Cache;
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
    Cache::flush();
});

it('redirects authorize requests to zitadel with broker parameters', function (): void {
    /** @var TestCase $this */
    $challenge = Pkce::challengeFrom('client-verifier');

    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
    ]));

    $response->assertRedirect();

    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    expect($query['client_id'])->toBe('broker-client');
    expect($query['redirect_uri'])->toBe('http://localhost/callbacks/zitadel');
    expect($query['response_type'])->toBe('code');
    expect($query['scope'])->toContain('offline_access');
    expect($query['state'])->not->toBe('client-state');
    expect($query['code_challenge'])->not->toBe($challenge);
    expect($query['code_challenge_method'])->toBe('S256');
    expect($query)->not->toHaveKey('prompt');
    expect($query)->not->toHaveKey('max_age');
});

it('forces prompt=login and max_age=0 for the admin panel client', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'sso-admin-panel',
        'redirect_uri' => 'http://localhost:3000/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ]));

    $response->assertRedirect();

    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    expect($query['prompt'])->toBe('login');
    expect($query['max_age'])->toBe('0');
});

it('rejects authorize requests without state', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400);
    $response->assertJson([
        'error' => 'invalid_request',
        'error_description' => 'state is required.',
    ]);
    expect(app(OidcProfileMetrics::class)->rejectCount('missing_state'))->toBe(1);
});

it('rejects authorize requests without nonce', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400);
    $response->assertJson([
        'error' => 'invalid_request',
        'error_description' => 'nonce is required.',
    ]);
    expect(app(OidcProfileMetrics::class)->rejectCount('missing_nonce'))->toBe(1);
});

it('rejects authorize requests with a non s256 challenge method', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'plain',
    ]));

    $response->assertStatus(400);
    $response->assertJson([
        'error' => 'invalid_request',
        'error_description' => 'PKCE with S256 is required.',
    ]);
    expect(app(OidcProfileMetrics::class)->rejectCount('invalid_code_challenge_method'))->toBe(1);
});

it('rejects authorize requests without code_challenge', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(400);
    $response->assertJson([
        'error' => 'invalid_request',
        'error_description' => 'code_challenge is required.',
    ]);
    expect(app(OidcProfileMetrics::class)->rejectCount('missing_code_challenge'))->toBe(1);
});

it('fails gracefully when the broker auth request store cannot persist state', function (): void {
    /** @var TestCase $this */
    $authRequests = Mockery::mock(AuthRequestStore::class);
    $authRequests->expects('put')
        ->andReturn(null);

    app()->instance(AuthRequestStore::class, $authRequests);

    $response = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ]));

    $response->assertStatus(503);
    $response->assertJson([
        'error' => 'temporarily_unavailable',
        'error_description' => 'The authentication session could not be started. Please try again.',
    ]);
});

it('completes the upstream callback and redirects with a local authorization code', function (): void {
    /** @var TestCase $this */
    $authorize = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ]));

    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $query);

    Http::fake([
        'https://zitadel.example/oauth/v2/token' => Http::response([
            'access_token' => 'upstream-access-token',
            'refresh_token' => 'upstream-refresh-token',
            'id_token' => FakeUpstreamOidc::idToken((string) $query['nonce']),
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
        'state' => $query['state'],
    ]));

    $callback->assertRedirect();
    $location = (string) $callback->headers->get('Location');

    expect($location)->toContain('http://localhost:3001/auth/callback?');
    expect($location)->toContain('state=client-state');
    expect($location)->toContain('code=');
});

it('rejects the upstream callback when the broker nonce does not match', function (): void {
    /** @var TestCase $this */
    $authorize = $this->get('/authorize?'.http_build_query([
        'client_id' => 'prototype-app-a',
        'redirect_uri' => 'http://localhost:3001/auth/callback',
        'response_type' => 'code',
        'scope' => 'openid profile email',
        'state' => 'client-state',
        'nonce' => 'client-nonce',
        'code_challenge' => Pkce::challengeFrom('client-verifier'),
        'code_challenge_method' => 'S256',
    ]));

    parse_str((string) parse_url((string) $authorize->headers->get('Location'), PHP_URL_QUERY), $query);

    Http::fake([
        'https://zitadel.example/oauth/v2/token' => Http::response([
            'access_token' => 'upstream-access-token',
            'refresh_token' => 'upstream-refresh-token',
            'id_token' => FakeUpstreamOidc::idToken('wrong-nonce'),
            'token_type' => 'Bearer',
            'expires_in' => 3600,
        ], 200),
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
        'https://zitadel.example/oidc/v1/userinfo' => Http::response([
            'sub' => '47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c',
            'email' => 'ada@example.com',
        ], 200),
    ]);

    $callback = $this->get('/callbacks/zitadel?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $query['state'],
    ]));

    $callback->assertRedirect();

    expect((string) $callback->headers->get('Location'))->toContain('error=temporarily_unavailable');
});

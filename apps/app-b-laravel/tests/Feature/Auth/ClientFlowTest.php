<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeBrokerJwt;
use Tests\TestCase;

beforeEach(function (): void {
    config()->set('services.sso.public_issuer', 'http://sso.example');
    config()->set('services.sso.internal_base_url', 'http://sso.example');
    config()->set('services.sso.client_id', 'prototype-app-b');
    config()->set('services.sso.client_secret', 'prototype-secret');
    config()->set('services.sso.redirect_uri', 'http://localhost:8300/auth/callback');
    config()->set('services.sso.jwks_url', 'http://sso.example/jwks');
    config()->set('services.sso.resource_audience', 'sso-resource-api');
    config()->set('services.resource_api.base_url', 'http://api.example');
});

it('shows the landing page for guest users after the silent SSO check', function (): void {
    /** @var TestCase $this */
    $this->get('/?sso_checked=1')
        ->assertOk()
        ->assertSee('App B')
        ->assertSee('Mulai Login Server-side');
});

it('does not silently reauthenticate after a terminal logout event', function (): void {
    /** @var TestCase $this */
    seedAuthenticatedSession($this);

    $this->get('/?event=signed-out')
        ->assertOk()
        ->assertSee('Logout terpusat selesai untuk App B.')
        ->assertSee('Mulai Login Server-side');

    $this->get('/dashboard')
        ->assertRedirect('/?event=session-expired');
});

it('keeps guest redirects https aware behind the reverse proxy', function (): void {
    /** @var TestCase $this */
    $this
        ->withServerVariables([
            'REMOTE_ADDR' => '127.0.0.1',
            'HTTP_HOST' => 'app-b.timeh.my.id',
            'HTTP_X_FORWARDED_HOST' => 'app-b.timeh.my.id',
            'HTTP_X_FORWARDED_PROTO' => 'https',
        ])
        ->get('/')
        ->assertRedirect('https://app-b.timeh.my.id/auth/login?prompt=none');
});

it('redirects login requests to the SSO authorize endpoint with PKCE', function (): void {
    /** @var TestCase $this */
    $response = $this->get('/auth/login');

    $response->assertRedirect();

    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    expect($query['client_id'])->toBe('prototype-app-b');
    expect($query['redirect_uri'])->toBe('http://localhost:8300/auth/callback');
    expect($query['response_type'])->toBe('code');
    expect($query['code_challenge_method'])->toBe('S256');
});

it('completes the callback handshake and renders the dashboard', function (): void {
    /** @var TestCase $this */

    // Step 1: Initiate login to capture the generated nonce from the redirect URL.
    $login = $this->get('/auth/login');
    parse_str((string) parse_url((string) $login->headers->get('Location'), PHP_URL_QUERY), $query);
    $nonce = (string) $query['nonce'];

    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
        'http://sso.example/token' => Http::response([
            'access_token' => FakeBrokerJwt::accessToken(),
            'id_token' => FakeBrokerJwt::idToken($nonce),
            'refresh_token' => 'refresh-token',
        ], 200),
        'http://api.example/api/profile' => Http::response([
            'resource_profile' => [
                'subject_id' => 'subject-123',
                'email' => 'ada@example.com',
                'display_name' => 'Ada Lovelace',
                'login_context' => [
                    'risk_score' => 15,
                    'mfa_required' => false,
                ],
            ],
        ], 200),
        'http://sso.example/connect/register-session' => Http::response([], 200),
    ]);

    // Step 3: Complete the callback with the matching state.
    $this->get('/auth/callback?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $query['state'],
    ]))
        ->assertRedirect('/dashboard');

    $this->get('/dashboard')
        ->assertOk()
        ->assertSee('Ada Lovelace')
        ->assertSee('shared-sid');

    Http::assertSent(fn ($request): bool => $request->url() === 'http://sso.example/connect/register-session');
});

it('rejects the callback when the id token nonce does not match', function (): void {
    /** @var TestCase $this */
    $login = $this->get('/auth/login');
    parse_str((string) parse_url((string) $login->headers->get('Location'), PHP_URL_QUERY), $query);

    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
        'http://sso.example/token' => Http::response([
            'access_token' => FakeBrokerJwt::accessToken(),
            'id_token' => FakeBrokerJwt::idToken('wrong-nonce'),
            'refresh_token' => 'refresh-token',
        ], 200),
    ]);

    $this->get('/auth/callback?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $query['state'],
    ]))
        ->assertRedirect('/?event=handshake-failed');
});

it('performs centralized logout and clears the local session', function (): void {
    /** @var TestCase $this */
    seedAuthenticatedSession($this);

    Http::fake([
        'http://sso.example/connect/logout' => Http::response([], 200),
    ]);

    $this->post('/auth/logout')
        ->assertRedirect('/?event=signed-out');

    $this->get('/dashboard')
        ->assertRedirect('/?event=session-expired');

    Http::assertSent(fn ($request): bool => $request->url() === 'http://sso.example/connect/logout');
});

it('refreshes an expired access token before rendering dashboard', function (): void {
    /** @var TestCase $this */
    seedAuthenticatedSession($this, ['expires_at' => time() - 30]);

    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
        'http://sso.example/token' => Http::response([
            'access_token' => FakeBrokerJwt::accessToken(['exp' => time() + 300]),
            'id_token' => 'rotated-id-token',
            'refresh_token' => 'refresh-token-rotated',
        ], 200),
    ]);

    $this->get('/dashboard')
        ->assertOk()
        ->assertSee('Ada Lovelace');

    expect(session('sso.session.refresh_token'))->toBe('refresh-token-rotated');
    expect(session('sso.session.expires_at'))->toBeGreaterThan(time());
    Http::assertSent(fn ($request): bool => $request->url() === 'http://sso.example/token'
        && $request['grant_type'] === 'refresh_token');
});

it('expires the local session when refresh token rotation fails', function (): void {
    /** @var TestCase $this */
    seedAuthenticatedSession($this, ['expires_at' => time() - 30]);

    Http::fake([
        'http://sso.example/token' => Http::response(['error' => 'invalid_grant'], 401),
    ]);

    $this->get('/dashboard')
        ->assertRedirect('/?event=session-expired');

    expect(session('sso.session'))->toBeNull();
});

it('keeps silent SSO misses on the landing page', function (): void {
    /** @var TestCase $this */
    $login = $this->get('/auth/login?prompt=none');
    parse_str((string) parse_url((string) $login->headers->get('Location'), PHP_URL_QUERY), $query);

    $this->get('/auth/callback?'.http_build_query([
        'error' => 'login_required',
        'state' => $query['state'],
    ]))
        ->assertRedirect('/?sso_checked=1&event=sso-miss');
});

it('clears indexed session rows when a back-channel logout token arrives', function (): void {
    /** @var TestCase $this */
    DB::table('sessions')->insert([
        'id' => 'session-1',
        'user_id' => null,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Pest',
        'payload' => 'serialized',
        'last_activity' => time(),
    ]);

    Cache::put('app-b:sid:shared-sid', ['session-1'], now()->addMinutes(5));
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $this->post('/auth/backchannel/logout', [
        'logout_token' => FakeBrokerJwt::logoutToken(),
    ])
        ->assertOk()
        ->assertJsonPath('cleared', 1)
        ->assertJsonPath('sid', 'shared-sid');

    expect(DB::table('sessions')->where('id', 'session-1')->exists())->toBeFalse();
});

it('clears local sessions by subject when back-channel logout omits sid', function (): void {
    /** @var TestCase $this */
    DB::table('sessions')->insert([
        'id' => 'session-2',
        'user_id' => null,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Pest',
        'payload' => 'serialized',
        'last_activity' => time(),
    ]);

    Cache::put('app-b:subject:subject-123', ['session-2'], now()->addMinutes(5));
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $this->post('/auth/backchannel/logout', [
        'logout_token' => FakeBrokerJwt::logoutToken(['sid' => null, 'jti' => 'logout-jti-subject']),
    ])
        ->assertOk()
        ->assertJsonPath('cleared', 1)
        ->assertJsonPath('sid', '')
        ->assertJsonPath('sub', 'subject-123');

    expect(DB::table('sessions')->where('id', 'session-2')->exists())->toBeFalse();
});

it('rejects replayed back-channel logout tokens', function (): void {
    /** @var TestCase $this */
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $token = FakeBrokerJwt::logoutToken(['jti' => 'logout-jti-2']);

    $this->post('/auth/backchannel/logout', [
        'logout_token' => $token,
    ])->assertOk();

    $this->post('/auth/backchannel/logout', [
        'logout_token' => $token,
    ])->assertStatus(401);
});

/**
 * @param  array<string, mixed>  $overrides
 */
function seedAuthenticatedSession(TestCase $case, array $overrides = []): void
{
    $now = time();

    $case->withSession([
        'sso.session' => array_replace([
            'sid' => 'shared-sid',
            'subject' => 'subject-123',
            'client_id' => 'prototype-app-b',
            'access_token' => 'access-token',
            'refresh_token' => 'refresh-token',
            'id_token' => 'id-token',
            'expires_at' => $now + 300,
            'created_at' => $now,
            'last_touched_at' => $now,
            'last_refreshed_at' => $now,
            'profile' => [
                'display_name' => 'Ada Lovelace',
            ],
        ], $overrides),
    ]);
}

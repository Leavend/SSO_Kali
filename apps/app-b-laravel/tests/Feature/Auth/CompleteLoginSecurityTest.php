<?php

declare(strict_types=1);

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

it('creates a local session when the broker handshake is valid', function (): void {
    /** @var TestCase $this */
    $query = startBrokerLogin($this);

    fakeSuccessfulHandshake((string) $query['nonce']);

    $this->get('/auth/callback?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $query['state'],
    ]))
        ->assertRedirect('/dashboard');

    $this->assertAuthenticated();
    expect(DB::table('users')->where('subject_id', 'subject-123')->exists())->toBeTrue();
    expect(DB::table('users')->count())->toBe(1);
    expect(session('sso.session.sid'))->toBe('shared-sid');
    expect(session('sso.session.subject'))->toBe('subject-123');

    Http::assertSent(fn ($request): bool => $request->url() === 'http://sso.example/connect/register-session');
});

it('creates a local session when the broker omits refresh token', function (): void {
    /** @var TestCase $this */
    $query = startBrokerLogin($this);

    fakeSuccessfulHandshake((string) $query['nonce'], false);

    $this->get('/auth/callback?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $query['state'],
    ]))
        ->assertRedirect('/dashboard');

    $this->assertAuthenticated();
    expect(session('sso.session.refresh_token'))->toBeNull();

    Http::assertSent(fn ($request): bool => $request->url() === 'http://sso.example/connect/register-session');
});

it('rejects the callback when the broker access token use is invalid', function (): void {
    /** @var TestCase $this */
    $query = startBrokerLogin($this);

    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
        'http://sso.example/token' => Http::response([
            'access_token' => FakeBrokerJwt::accessToken(['token_use' => 'id']),
            'id_token' => FakeBrokerJwt::idToken((string) $query['nonce']),
            'refresh_token' => 'refresh-token',
        ], 200),
    ]);

    $this->get('/auth/callback?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $query['state'],
    ]))
        ->assertRedirect('/')
        ->assertSessionHas('status', 'Handshake SSO gagal diselesaikan.');

    $this->assertGuest();
    expect(DB::table('users')->count())->toBe(0);
});

it('rejects the callback when the broker token endpoint returns invalid client credentials', function (): void {
    /** @var TestCase $this */
    $query = startBrokerLogin($this);

    Http::fake([
        'http://sso.example/token' => Http::response([
            'error' => 'invalid_client',
            'error_description' => 'Client authentication failed.',
        ], 401),
    ]);

    $this->get('/auth/callback?'.http_build_query([
        'code' => 'upstream-code',
        'state' => $query['state'],
    ]))
        ->assertRedirect('/')
        ->assertSessionHas('status', 'Handshake SSO gagal diselesaikan.');

    $this->assertGuest();
    expect(DB::table('users')->count())->toBe(0);
});

/**
 * @return array<string, string>
 */
function startBrokerLogin(TestCase $case): array
{
    $response = $case->get('/auth/login');

    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    return array_map(static fn (mixed $value): string => (string) $value, $query);
}

function fakeSuccessfulHandshake(string $nonce, bool $includeRefreshToken = true): void
{
    $tokenPayload = [
        'access_token' => FakeBrokerJwt::accessToken(),
        'id_token' => FakeBrokerJwt::idToken($nonce),
    ];
    if ($includeRefreshToken) {
        $tokenPayload['refresh_token'] = 'refresh-token';
    }

    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
        'http://sso.example/token' => Http::response($tokenPayload, 200),
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
}

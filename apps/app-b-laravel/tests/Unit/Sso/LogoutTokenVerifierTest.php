<?php

declare(strict_types=1);

use App\Services\Sso\JwtRejectMetrics;
use App\Services\Sso\LogoutTokenReplayStore;
use App\Services\Sso\LogoutTokenVerifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeBrokerJwt;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    config()->set('services.sso.public_issuer', 'http://sso.example');
    config()->set('services.sso.client_id', 'prototype-app-b');
    config()->set('services.sso.jwks_url', 'http://sso.example/jwks');
    config()->set('services.sso.jwt.allowed_algs', ['RS256']);

    Cache::flush();
    Http::preventStrayRequests();
});

it('verifies valid logout tokens', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $claims = app(LogoutTokenVerifier::class)->claims(FakeBrokerJwt::logoutToken());

    expect($claims['sid'])->toBe('shared-sid');
    expect($claims['jti'])->toBeString();
    Http::assertSentCount(1);
});

it('rejects logout tokens that omit the issued-at claim', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => app(LogoutTokenVerifier::class)->claims(
        FakeBrokerJwt::logoutToken(['iat' => null]),
    ))->toThrow(RuntimeException::class, 'iat');

    expect($metrics->count('missing_iat'))->toBe(1);
});

it('rejects logout tokens that omit the expiration claim', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => app(LogoutTokenVerifier::class)->claims(
        FakeBrokerJwt::logoutToken(['exp' => null]),
    ))->toThrow(RuntimeException::class, 'exp');

    expect($metrics->count('missing_exp'))->toBe(1);
});

it('rejects expired logout tokens', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => app(LogoutTokenVerifier::class)->claims(
        FakeBrokerJwt::expiredLogoutToken(),
    ))->toThrow(RuntimeException::class, 'expired');

    expect($metrics->count('token_expired'))->toBe(1);
});

it('rejects unsigned logout tokens and records the reject reason', function (): void {
    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => app(LogoutTokenVerifier::class)->claims(
        FakeBrokerJwt::algorithmToken([
            'iss' => 'http://sso.example',
            'aud' => 'prototype-app-b',
            'sub' => 'subject-123',
            'sid' => 'shared-sid',
            'events' => [
                'http://schemas.openid.net/event/backchannel-logout' => [],
            ],
            'iat' => time(),
            'exp' => time() + 300,
        ], 'none'),
    ))->toThrow(RuntimeException::class, 'Unsigned');

    expect($metrics->count('alg_none'))->toBe(1);
    Http::assertNothingSent();
});

it('rejects logout tokens that omit the logout event', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => app(LogoutTokenVerifier::class)->claims(
        FakeBrokerJwt::logoutToken(['events' => []]),
    ))->toThrow(RuntimeException::class, 'events');

    expect($metrics->count('invalid_events'))->toBe(1);
});

it('rejects logout tokens that omit both subject and sid', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => app(LogoutTokenVerifier::class)->claims(
        FakeBrokerJwt::logoutToken(['sub' => null, 'sid' => null]),
    ))->toThrow(RuntimeException::class, 'subject/session');

    expect($metrics->count('missing_subject_or_sid'))->toBe(1);
});

it('rejects logout tokens that contain a nonce claim', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);

    expect(fn () => app(LogoutTokenVerifier::class)->claims(
        FakeBrokerJwt::logoutToken(['nonce' => 'forbidden']),
    ))->toThrow(RuntimeException::class, 'must not contain a nonce');

    expect($metrics->count('invalid_nonce'))->toBe(1);
});

it('rejects replayed logout token jti and records a replay alert', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $token = FakeBrokerJwt::logoutToken(['jti' => 'logout-jti-1']);
    $verifier = app(LogoutTokenVerifier::class);
    $store = app(LogoutTokenReplayStore::class);

    $verifier->claims($token);

    expect(fn () => $verifier->claims($token))
        ->toThrow(RuntimeException::class, 'replay');

    expect($store->replayAlerts())->toBe(1);
});

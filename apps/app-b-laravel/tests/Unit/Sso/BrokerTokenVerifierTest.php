<?php

declare(strict_types=1);

use App\Services\Sso\BrokerTokenVerifier;
use App\Services\Sso\JwtRejectMetrics;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeBrokerJwt;

beforeEach(function (): void {
    config()->set('services.sso.public_issuer', 'http://sso.example');
    config()->set('services.sso.client_id', 'prototype-app-b');
    config()->set('services.sso.jwks_url', 'http://sso.example/jwks');
    config()->set('services.sso.resource_audience', 'sso-resource-api');

    Cache::flush();
    Http::preventStrayRequests();
});

it('verifies valid broker access and id tokens', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $verifier = app(BrokerTokenVerifier::class);
    $access = $verifier->verifyAccessToken(FakeBrokerJwt::accessToken());
    $id = $verifier->verifyIdToken(FakeBrokerJwt::idToken('expected-nonce'), 'expected-nonce');

    expect($access['token_use'])->toBe('access');
    expect($id['nonce'])->toBe('expected-nonce');
    Http::assertSentCount(1);
});

it('rejects broker access tokens with an invalid token_use', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $verifier = app(BrokerTokenVerifier::class);

    expect(fn () => $verifier->verifyAccessToken(
        FakeBrokerJwt::accessToken(['token_use' => 'id']),
    ))->toThrow(RuntimeException::class, 'token use');
});

it('rejects broker access tokens with an invalid audience', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $verifier = app(BrokerTokenVerifier::class);

    expect(fn () => $verifier->verifyAccessToken(
        FakeBrokerJwt::accessToken(['aud' => 'wrong-audience']),
    ))->toThrow(RuntimeException::class, 'audience');
});

it('rejects broker id tokens when the issuer is invalid', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $verifier = app(BrokerTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeBrokerJwt::idToken('expected-nonce', ['iss' => 'http://evil.example']),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'issuer');
});

it('rejects broker id tokens when the nonce is invalid', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $verifier = app(BrokerTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeBrokerJwt::idToken('unexpected-nonce'),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'nonce');
});

it('rejects broker tokens with a tampered signature', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $verifier = app(BrokerTokenVerifier::class);

    expect(fn () => $verifier->verifyAccessToken(
        FakeBrokerJwt::tampered(FakeBrokerJwt::accessToken()),
    ))->toThrow(RuntimeException::class, 'could not be verified');
});

it('rejects unsigned broker tokens and records the reject reason', function (): void {
    $metrics = app(JwtRejectMetrics::class);
    $verifier = app(BrokerTokenVerifier::class);

    expect(fn () => $verifier->verifyAccessToken(
        FakeBrokerJwt::algorithmToken([
            'sub' => 'subject-123',
            'sid' => 'shared-sid',
            'client_id' => 'prototype-app-b',
            'token_use' => 'access',
            'aud' => 'sso-resource-api',
            'iss' => 'http://sso.example',
            'iat' => time(),
            'exp' => time() + 300,
        ], 'none'),
    ))->toThrow(RuntimeException::class, 'Unsigned');

    expect($metrics->count('alg_none'))->toBe(1);
    Http::assertNothingSent();
});

it('rejects broker access tokens without an issued-at claim', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::response(FakeBrokerJwt::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);
    $verifier = app(BrokerTokenVerifier::class);

    expect(fn () => $verifier->verifyAccessToken(
        FakeBrokerJwt::accessToken(['iat' => null]),
    ))->toThrow(RuntimeException::class, 'iat');

    expect($metrics->count('missing_iat'))->toBe(1);
});

it('recovers from broker jwks kid rotation after a refresh', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::sequence()
            ->push(FakeBrokerJwt::jwks('old-kid'), 200)
            ->push(FakeBrokerJwt::jwks('new-kid'), 200),
    ]);

    $verifier = app(BrokerTokenVerifier::class);

    $verifier->verifyAccessToken(FakeBrokerJwt::accessToken([], 'old-kid'));
    $claims = $verifier->verifyAccessToken(FakeBrokerJwt::accessToken([], 'new-kid'));

    expect($claims['sub'])->toBe('subject-123');
    Http::assertSentCount(2);
});

<?php

declare(strict_types=1);

use App\Services\Oidc\JwtRejectMetrics;
use App\Services\Zitadel\ZitadelTokenVerifier;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeUpstreamOidc;

beforeEach(function (): void {
    config()->set('sso.broker.public_issuer', 'https://zitadel.example');
    config()->set('sso.broker.internal_issuer', 'https://zitadel.example');
    config()->set('sso.broker.client_id', 'broker-client');

    Cache::flush();
    Http::preventStrayRequests();
});

it('accepts a valid upstream id token and caches the jwks', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
    ]);

    $verifier = app(ZitadelTokenVerifier::class);

    $claims = $verifier->verifyIdToken(FakeUpstreamOidc::idToken('expected-nonce'), 'expected-nonce');
    $verifier->verifyIdToken(FakeUpstreamOidc::idToken('expected-nonce'), 'expected-nonce');

    expect($claims['sub'])->toBe('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    Http::assertSentCount(1);
});

it('accepts a trusted internal issuer alias from discovery metadata', function (): void {
    config()->set('sso.broker.internal_issuer', 'http://zitadel.internal:8080');

    Http::fake([
        'https://zitadel.example/.well-known/openid-configuration' => Http::response([
            'issuer' => 'https://zitadel.example',
            'jwks_uri' => 'https://zitadel.example/oauth/v2/keys',
        ], 200),
        'http://zitadel.internal:8080/.well-known/openid-configuration' => Http::response([
            'issuer' => 'https://zitadel.internal:8080',
            'jwks_uri' => 'https://zitadel.internal:8080/oauth/v2/keys',
        ], 200),
        'http://zitadel.internal:8080/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
    ]);

    $verifier = app(ZitadelTokenVerifier::class);
    $claims = $verifier->verifyIdToken(
        FakeUpstreamOidc::idToken('expected-nonce', ['iss' => 'https://zitadel.internal:8080']),
        'expected-nonce',
    );

    expect($claims['iss'])->toBe('https://zitadel.internal:8080');
});

it('recovers from jwks kid rotation after refreshing the key set', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::sequence()
            ->push(FakeUpstreamOidc::jwks('old-kid'), 200)
            ->push(FakeUpstreamOidc::jwks('new-kid'), 200),
    ]);

    $verifier = app(ZitadelTokenVerifier::class);

    $verifier->verifyIdToken(FakeUpstreamOidc::idToken('expected-nonce', [], 'old-kid'), 'expected-nonce');
    $claims = $verifier->verifyIdToken(FakeUpstreamOidc::idToken('expected-nonce', [], 'new-kid'), 'expected-nonce');

    expect($claims['sub'])->toBe('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c');
    Http::assertSentCount(2);
});

it('rejects an upstream id token when the nonce does not match', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
    ]);

    $verifier = app(ZitadelTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeUpstreamOidc::idToken('unexpected-nonce'),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'nonce');
});

it('rejects an expired upstream id token', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
    ]);

    $verifier = app(ZitadelTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeUpstreamOidc::expiredIdToken('expected-nonce'),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'expired');
});

it('rejects an upstream id token with a tampered signature', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
    ]);

    $verifier = app(ZitadelTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeUpstreamOidc::tamperedIdToken('expected-nonce'),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'could not be verified');
});

it('rejects an upstream id token from an untrusted issuer', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
    ]);

    $verifier = app(ZitadelTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeUpstreamOidc::idToken('expected-nonce', ['iss' => 'https://evil.example']),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'issuer');
});

it('rejects unsigned upstream id tokens and records the reject reason', function (): void {
    $metrics = app(JwtRejectMetrics::class);
    $verifier = app(ZitadelTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeUpstreamOidc::algorithmToken('expected-nonce', 'none'),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'Unsigned');

    expect($metrics->count('alg_none'))->toBe(1);
    Http::assertNothingSent();
});

it('rejects upstream id tokens with non-allowlisted algorithms', function (): void {
    $metrics = app(JwtRejectMetrics::class);
    $verifier = app(ZitadelTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeUpstreamOidc::algorithmToken('expected-nonce', 'HS256'),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'not allowed');

    expect($metrics->count('alg_not_allowed'))->toBe(1);
    Http::assertNothingSent();
});

it('rejects upstream id tokens that omit the issued-at claim', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::response(FakeUpstreamOidc::jwks(), 200),
    ]);

    $metrics = app(JwtRejectMetrics::class);
    $verifier = app(ZitadelTokenVerifier::class);

    expect(fn () => $verifier->verifyIdToken(
        FakeUpstreamOidc::idToken('expected-nonce', ['iat' => null]),
        'expected-nonce',
    ))->toThrow(RuntimeException::class, 'iat');

    expect($metrics->count('missing_iat'))->toBe(1);
});

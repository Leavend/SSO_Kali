<?php

declare(strict_types=1);

use App\Services\Oidc\JwksRotationMetrics;
use App\Services\Zitadel\ZitadelTokenVerifier;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Assert;

beforeEach(function (): void {
    skipWithoutHarness();

    Cache::flush();
    config()->set('sso.broker.public_issuer', upstreamIssuer());
    config()->set('sso.broker.internal_issuer', upstreamIssuer());
    config()->set('sso.broker.client_id', 'broker-client');
});

it('refreshes upstream jwks after a kid miss against the mock rotation server', function (): void {
    resetScenario('upstream');

    $verifier = app(ZitadelTokenVerifier::class);
    $metrics = app(JwksRotationMetrics::class);

    $verifier->verifyIdToken(issueUpstreamIdToken('old'), 'expected-nonce');
    rotateScenario('upstream');
    $claims = $verifier->verifyIdToken(issueUpstreamIdToken('new'), 'expected-nonce');

    expect($claims['sub'])->toBe('47c0cf0b-8af7-4af6-b2cb-1fd8cf4f8d8c')
        ->and($metrics->refreshSuccessTotal())->toBeGreaterThanOrEqual(2)
        ->and($metrics->refreshFailureTotal())->toBe(0);
});

it('records a refresh failure when the requested kid never appears', function (): void {
    resetScenario('upstream');

    $verifier = app(ZitadelTokenVerifier::class);
    $metrics = app(JwksRotationMetrics::class);

    $verifier->verifyIdToken(issueUpstreamIdToken('old'), 'expected-nonce');

    expect(fn () => $verifier->verifyIdToken(issueUpstreamIdToken('new'), 'expected-nonce'))
        ->toThrow(RuntimeException::class, 'could not be verified');

    expect($metrics->refreshFailureTotal())->toBeGreaterThanOrEqual(1);
});

function skipWithoutHarness(): void
{
    if (mockBaseUrl() === null) {
        Assert::markTestSkipped('JWKS rotation mock harness is not configured.');
    }
}

function mockBaseUrl(): ?string
{
    $value = getenv('JWKS_ROTATION_MOCK_BASE_URL');

    return is_string($value) && $value !== '' ? rtrim($value, '/') : null;
}

function upstreamIssuer(): string
{
    return mockBaseUrl().'/upstream';
}

function resetScenario(string $target): void
{
    Http::asJson()->post(mockBaseUrl()."/scenario/reset?target={$target}")->throw();
}

function rotateScenario(string $target): void
{
    Http::asJson()->post(mockBaseUrl()."/scenario/rotate?target={$target}")->throw();
}

function issueUpstreamIdToken(string $kid): string
{
    return Http::get(mockBaseUrl()."/issue/upstream/id?kid={$kid}&nonce=expected-nonce")
        ->throw()
        ->body();
}

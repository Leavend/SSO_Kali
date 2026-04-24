<?php

declare(strict_types=1);

use App\Services\Sso\BrokerTokenVerifier;
use App\Services\Sso\JwksRotationMetrics;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Assert;

beforeEach(function (): void {
    skipWithoutHarness();

    Cache::flush();
    config()->set('services.sso.public_issuer', brokerIssuer());
    config()->set('services.sso.client_id', 'prototype-app-b');
    config()->set('services.sso.resource_audience', 'sso-resource-api');
    config()->set('services.sso.jwks_url', brokerIssuer().'/jwks');
});

it('refreshes broker jwks after a kid miss against the mock rotation server', function (): void {
    resetScenario('broker');

    $verifier = app(BrokerTokenVerifier::class);
    $metrics = app(JwksRotationMetrics::class);

    $verifier->verifyAccessToken(issueBrokerAccessToken('old'));
    rotateScenario('broker');
    $claims = $verifier->verifyAccessToken(issueBrokerAccessToken('new'));

    expect($claims['sub'])->toBe('subject-123')
        ->and($metrics->refreshSuccessTotal())->toBeGreaterThanOrEqual(2)
        ->and($metrics->refreshFailureTotal())->toBe(0);
});

it('records a refresh failure when broker jwks never rotates to the requested kid', function (): void {
    resetScenario('broker');

    $verifier = app(BrokerTokenVerifier::class);
    $metrics = app(JwksRotationMetrics::class);

    $verifier->verifyAccessToken(issueBrokerAccessToken('old'));

    expect(fn () => $verifier->verifyAccessToken(issueBrokerAccessToken('new')))
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

function brokerIssuer(): string
{
    return mockBaseUrl().'/broker';
}

function resetScenario(string $target): void
{
    Http::asJson()->post(mockBaseUrl()."/scenario/reset?target={$target}")->throw();
}

function rotateScenario(string $target): void
{
    Http::asJson()->post(mockBaseUrl()."/scenario/rotate?target={$target}")->throw();
}

function issueBrokerAccessToken(string $kid): string
{
    return Http::get(mockBaseUrl()."/issue/broker/access?kid={$kid}")
        ->throw()
        ->body();
}

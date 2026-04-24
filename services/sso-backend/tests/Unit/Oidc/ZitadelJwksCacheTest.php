<?php

declare(strict_types=1);

use App\Services\Oidc\JwksRotationMetrics;
use App\Services\Zitadel\ZitadelJwksCache;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeUpstreamOidc;

beforeEach(function (): void {
    config()->set('sso.jwks.max_refresh_attempts', 2);
    config()->set('sso.jwks.cache_ttl_seconds', 300);
    config()->set('sso.jwks.min_cache_ttl_seconds', 1);
    config()->set('sso.jwks.max_cache_ttl_seconds', 3600);

    Cache::flush();
    Http::preventStrayRequests();
});

it('refreshes the cached jwks when the token kid rotates', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::sequence()
            ->push(FakeUpstreamOidc::jwks('old-kid'), 200, ['Cache-Control' => 'max-age=300'])
            ->push(FakeUpstreamOidc::jwks('new-kid'), 200, ['Cache-Control' => 'max-age=300']),
    ]);

    $cache = app(ZitadelJwksCache::class);
    $metrics = app(JwksRotationMetrics::class);

    expect($cache->document('https://zitadel.example/oauth/v2/keys', 'old-kid')['keys'][0]['kid'])->toBe('old-kid');
    expect($cache->document('https://zitadel.example/oauth/v2/keys', 'new-kid')['keys'][0]['kid'])->toBe('new-kid');
    expect($cache->document('https://zitadel.example/oauth/v2/keys', 'new-kid')['keys'][0]['kid'])->toBe('new-kid');
    expect($metrics->cacheHitRatio())->toBeGreaterThan(0.0);
    expect($metrics->refreshFailureTotal())->toBe(0);
    expect($metrics->refreshSuccessTotal())->toBe(2);
    Http::assertSentCount(2);
});

it('fails after bounded refresh retries when the requested kid never appears', function (): void {
    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::sequence()
            ->push(FakeUpstreamOidc::jwks('old-kid'), 200)
            ->push(FakeUpstreamOidc::jwks('old-kid'), 200)
            ->push(FakeUpstreamOidc::jwks('old-kid'), 200),
    ]);

    $cache = app(ZitadelJwksCache::class);
    $metrics = app(JwksRotationMetrics::class);

    $cache->document('https://zitadel.example/oauth/v2/keys', 'old-kid');

    expect(fn () => $cache->document('https://zitadel.example/oauth/v2/keys', 'new-kid'))
        ->toThrow(RuntimeException::class, 'could not be refreshed');

    expect($metrics->refreshFailureTotal())->toBe(1);
    Http::assertSentCount(3);
});

it('prefers cache-control max-age over the fallback ttl', function (): void {
    config()->set('sso.jwks.cache_ttl_seconds', 1);

    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::response(
            FakeUpstreamOidc::jwks('cache-kid'),
            200,
            ['Cache-Control' => 'public, max-age=120'],
        ),
    ]);

    $cache = app(ZitadelJwksCache::class);

    $cache->document('https://zitadel.example/oauth/v2/keys', 'cache-kid');
    Date::setTestNow(now()->addSeconds(2));
    $cache->document('https://zitadel.example/oauth/v2/keys', 'cache-kid');
    Date::setTestNow();

    Http::assertSentCount(1);
});

it('falls back to configured ttl when cache headers are absent', function (): void {
    config()->set('sso.jwks.cache_ttl_seconds', 1);

    Http::fake([
        'https://zitadel.example/oauth/v2/keys' => Http::sequence()
            ->push(FakeUpstreamOidc::jwks('cache-kid'), 200)
            ->push(FakeUpstreamOidc::jwks('cache-kid'), 200),
    ]);

    $cache = app(ZitadelJwksCache::class);

    $cache->document('https://zitadel.example/oauth/v2/keys', 'cache-kid');
    // Simulate cache expiry by flushing and advancing time
    Cache::flush();
    Date::setTestNow(now()->addSeconds(2));
    $cache->document('https://zitadel.example/oauth/v2/keys', 'cache-kid');
    Date::setTestNow();

    Http::assertSentCount(2);
});

<?php

declare(strict_types=1);

use App\Services\Sso\BrokerJwksCache;
use App\Services\Sso\JwksRotationMetrics;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeBrokerJwt;

beforeEach(function (): void {
    config()->set('services.sso.jwks.max_refresh_attempts', 2);
    config()->set('services.sso.jwks.cache_ttl_seconds', 300);
    config()->set('services.sso.jwks.min_cache_ttl_seconds', 1);
    config()->set('services.sso.jwks.max_cache_ttl_seconds', 3600);

    Cache::flush();
    Http::preventStrayRequests();
});

it('refreshes broker jwks when a new kid appears', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::sequence()
            ->push(FakeBrokerJwt::jwks('old-kid'), 200, ['Cache-Control' => 'max-age=300'])
            ->push(FakeBrokerJwt::jwks('new-kid'), 200, ['Cache-Control' => 'max-age=300']),
    ]);

    $cache = app(BrokerJwksCache::class);
    $metrics = app(JwksRotationMetrics::class);

    expect($cache->document('http://sso.example/jwks', 'old-kid')['keys'][0]['kid'])->toBe('old-kid');
    expect($cache->document('http://sso.example/jwks', 'new-kid')['keys'][0]['kid'])->toBe('new-kid');
    expect($cache->document('http://sso.example/jwks', 'new-kid')['keys'][0]['kid'])->toBe('new-kid');
    expect($metrics->cacheHitRatio())->toBeGreaterThan(0.0);
    expect($metrics->refreshFailureTotal())->toBe(0);
    expect($metrics->refreshSuccessTotal())->toBe(2);
    Http::assertSentCount(2);
});

it('fails after bounded retries when broker jwks never exposes the requested kid', function (): void {
    Http::fake([
        'http://sso.example/jwks' => Http::sequence()
            ->push(FakeBrokerJwt::jwks('old-kid'), 200)
            ->push(FakeBrokerJwt::jwks('old-kid'), 200)
            ->push(FakeBrokerJwt::jwks('old-kid'), 200),
    ]);

    $cache = app(BrokerJwksCache::class);
    $metrics = app(JwksRotationMetrics::class);

    $cache->document('http://sso.example/jwks', 'old-kid');

    expect(fn () => $cache->document('http://sso.example/jwks', 'new-kid'))
        ->toThrow(RuntimeException::class, 'could not be refreshed');

    expect($metrics->refreshFailureTotal())->toBe(1);
    Http::assertSentCount(3);
});

it('honors cache-control ttl for broker jwks caching', function (): void {
    config()->set('services.sso.jwks.cache_ttl_seconds', 1);

    Http::fake([
        'http://sso.example/jwks' => Http::response(
            FakeBrokerJwt::jwks('cache-kid'),
            200,
            ['Cache-Control' => 'max-age=120'],
        ),
    ]);

    $cache = app(BrokerJwksCache::class);

    $cache->document('http://sso.example/jwks', 'cache-kid');
    Date::setTestNow(now()->addSeconds(2));
    $cache->document('http://sso.example/jwks', 'cache-kid');
    Date::setTestNow();

    Http::assertSentCount(1);
});

it('falls back to configured ttl when broker jwks headers omit max-age', function (): void {
    config()->set('services.sso.jwks.cache_ttl_seconds', 1);

    Http::fake([
        'http://sso.example/jwks' => Http::sequence()
            ->push(FakeBrokerJwt::jwks('cache-kid'), 200)
            ->push(FakeBrokerJwt::jwks('cache-kid'), 200),
    ]);

    $cache = app(BrokerJwksCache::class);

    $cache->document('http://sso.example/jwks', 'cache-kid');
    Date::setTestNow(now()->addSeconds(2));
    $cache->document('http://sso.example/jwks', 'cache-kid');
    Date::setTestNow();

    Http::assertSentCount(2);
});

<?php

declare(strict_types=1);

use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Facades\Cache;

it('returns the provided default when cache reads fail', function (): void {
    Cache::shouldReceive('get')
        ->once()
        ->with('cache-key', 'fallback')
        ->andThrow(new RuntimeException('redis unavailable'));

    expect(app(ResilientCacheStore::class)->get('cache-key', 'fallback'))->toBe('fallback');
});

it('returns resolver output when remember cannot read or write cache', function (): void {
    Cache::shouldReceive('get')
        ->once()
        ->andThrow(new RuntimeException('redis unavailable'));

    Cache::shouldReceive('put')
        ->once()
        ->andThrow(new RuntimeException('redis unavailable'));

    $value = app(ResilientCacheStore::class)->remember('remember-key', 60, fn (): array => ['ok' => true]);

    expect($value)->toBe(['ok' => true]);
});

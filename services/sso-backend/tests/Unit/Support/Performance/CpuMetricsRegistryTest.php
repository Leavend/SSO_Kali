<?php

declare(strict_types=1);

namespace Tests\Unit\Support\Performance;

use App\Support\Performance\CpuMetricsRegistry;
use Tests\TestCase;

it('records JWT sign operation', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore());

    $metrics->recordJwtSign(1.5);

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['jwt_operations']['sign'])->toBe(1);
});

it('records JWT decode operation', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore());

    $metrics->recordJwtDecode(0.75);

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['jwt_operations']['decode'])->toBe(1);
});

it('records key material fetch', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore());

    $metrics->recordKeyMaterialFetch(2.0);

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['key_material']['fetch_count'])->toBe(1);
});

it('records cache operations', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore());

    $metrics->recordCacheGet('test:key', true);
    $metrics->recordCacheGet('test:key2', false);
    $metrics->recordCachePut('test:key3');
    $metrics->recordCacheIncrement('counter');

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['cache_operations']['get'])->toBe(2);
    expect($snapshot['cache_operations']['put'])->toBe(1);
    expect($snapshot['cache_operations']['increment'])->toBe(1);
});

it('calculates cache hit ratio correctly', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore());

    $metrics->recordCacheGet('test:key', true);  // hit
    $metrics->recordCacheGet('test:key', true);  // hit
    $metrics->recordCacheGet('test:key', false); // miss
    $metrics->recordCacheGet('test:key', false); // miss

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['cache_operations']['hit_ratio'])->toBe(0.5);
});

it('aggregates JWT operations total', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore());

    $metrics->recordJwtSign();
    $metrics->recordJwtSign();
    $metrics->recordJwtDecode();
    $metrics->recordJwtDecode();
    $metrics->recordJwtDecode();

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['jwt_operations']['total'])->toBe(5);
});

it('resets all metrics', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore());

    $metrics->recordJwtSign();
    $metrics->recordCacheGet('test', true);

    $metrics->reset();

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['jwt_operations']['sign'])->toBe(0);
    expect($snapshot['cache_operations']['get'])->toBe(0);
    expect($snapshot['totals']['operations'])->toBe(0);
});

it('does not record metrics when disabled', function (): void {
    $metrics = new CpuMetricsRegistry(new \App\Support\Cache\AtomicCounterStore(), false);

    $metrics->recordJwtSign();

    $snapshot = $metrics->getMetricsSnapshot();
    expect($snapshot['jwt_operations']['sign'])->toBe(0);
});

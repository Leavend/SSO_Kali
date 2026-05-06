<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\AtomicCounterStore;

final class JwksRotationMetrics
{
    public function __construct(
        private readonly AtomicCounterStore $counter,
    ) {}

    public function recordCacheHit(): void
    {
        $this->counter->increment('jwks_cache_hit_total');
    }

    public function recordCacheMiss(): void
    {
        $this->counter->increment('jwks_cache_miss_total');
    }

    public function recordRefreshFailure(): void
    {
        $this->counter->increment('jwks_refresh_fail_total');
    }

    public function recordRefreshSuccess(): void
    {
        $this->counter->increment('jwks_refresh_success_total');
    }

    public function cacheHitRatio(): float
    {
        $hits = $this->counter->get('metrics:jwks_cache_hit_total', 0);
        $misses = $this->counter->get('metrics:jwks_cache_miss_total', 0);
        $total = $hits + $misses;

        return $total === 0 ? 0.0 : $hits / $total;
    }

    public function refreshFailureTotal(): int
    {
        return $this->counter->get('metrics:jwks_refresh_fail_total', 0);
    }

    public function refreshSuccessTotal(): int
    {
        return $this->counter->get('metrics:jwks_refresh_success_total', 0);
    }
}

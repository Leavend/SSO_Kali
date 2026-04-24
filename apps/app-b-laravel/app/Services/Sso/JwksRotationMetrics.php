<?php

declare(strict_types=1);

namespace App\Services\Sso;

use Illuminate\Support\Facades\Cache;

final class JwksRotationMetrics
{
    public function recordCacheHit(): void
    {
        $this->increment('jwks_cache_hit_total');
    }

    public function recordCacheMiss(): void
    {
        $this->increment('jwks_cache_miss_total');
    }

    public function recordRefreshFailure(): void
    {
        $this->increment('jwks_refresh_fail_total');
    }

    public function recordRefreshSuccess(): void
    {
        $this->increment('jwks_refresh_success_total');
    }

    public function cacheHitRatio(): float
    {
        $hits = $this->count('jwks_cache_hit_total');
        $misses = $this->count('jwks_cache_miss_total');
        $total = $hits + $misses;

        return $total === 0 ? 0.0 : $hits / $total;
    }

    public function refreshFailureTotal(): int
    {
        return $this->count('jwks_refresh_fail_total');
    }

    public function refreshSuccessTotal(): int
    {
        return $this->count('jwks_refresh_success_total');
    }

    private function increment(string $name): void
    {
        $key = $this->key($name);
        $count = Cache::get($key, 0);

        Cache::forever($key, (int) $count + 1);
    }

    private function count(string $name): int
    {
        return (int) Cache::get($this->key($name), 0);
    }

    private function key(string $name): string
    {
        return 'app-b:metrics:'.$name;
    }
}

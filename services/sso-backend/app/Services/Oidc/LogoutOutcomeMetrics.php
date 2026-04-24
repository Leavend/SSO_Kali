<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;

final class LogoutOutcomeMetrics
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    public function recordSuccess(): void
    {
        $this->increment('metrics:logout_success_total');
    }

    public function recordFailure(string $reason): void
    {
        $this->increment('metrics:logout_failure_total');
        $this->increment($this->failureKey($reason));
    }

    public function successTotal(): int
    {
        return $this->count('metrics:logout_success_total');
    }

    public function failureTotal(): int
    {
        return $this->count('metrics:logout_failure_total');
    }

    public function failureCount(string $reason): int
    {
        return $this->count($this->failureKey($reason));
    }

    private function increment(string $key): void
    {
        $count = $this->cache->get($key, 0);
        $this->cache->forever($key, (int) $count + 1);
    }

    private function count(string $key): int
    {
        return (int) $this->cache->get($key, 0);
    }

    private function failureKey(string $reason): string
    {
        return 'metrics:logout_failure_total:'.$reason;
    }
}

<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;

final class JwtRejectMetrics
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    public function increment(string $reason): void
    {
        $key = $this->key($reason);
        $count = $this->cache->get($key, 0);

        $this->cache->forever($key, (int) $count + 1);
    }

    public function count(string $reason): int
    {
        return (int) $this->cache->get($this->key($reason), 0);
    }

    private function key(string $reason): string
    {
        return 'metrics:jwt_reject_total:'.$reason;
    }
}

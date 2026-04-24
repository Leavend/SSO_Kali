<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;

final class OidcProfileMetrics
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    public function incrementReject(string $reason): void
    {
        $key = $this->rejectKey($reason);
        $count = $this->cache->get($key, 0);

        $this->cache->forever($key, (int) $count + 1);
    }

    public function rejectCount(string $reason): int
    {
        return (int) $this->cache->get($this->rejectKey($reason), 0);
    }

    private function rejectKey(string $reason): string
    {
        return 'metrics:pkce_reject_total:'.$reason;
    }
}

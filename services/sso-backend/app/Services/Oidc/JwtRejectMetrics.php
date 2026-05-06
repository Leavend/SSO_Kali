<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\AtomicCounterStore;

final class JwtRejectMetrics
{
    public function __construct(
        private readonly AtomicCounterStore $counter,
    ) {}

    public function increment(string $reason): void
    {
        $this->counter->increment($this->key($reason));
    }

    public function count(string $reason): int
    {
        return $this->counter->get($this->key($reason), 0);
    }

    private function key(string $reason): string
    {
        return 'metrics:jwt_reject_total:'.$reason;
    }
}

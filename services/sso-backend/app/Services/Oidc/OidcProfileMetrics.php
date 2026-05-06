<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\AtomicCounterStore;

final class OidcProfileMetrics
{
    public function __construct(
        private readonly AtomicCounterStore $counter,
    ) {}

    public function incrementReject(string $reason): void
    {
        $this->counter->increment($this->rejectKey($reason), 1);
    }

    public function rejectCount(string $reason): int
    {
        return $this->counter->get($this->rejectKey($reason), 0);
    }

    private function rejectKey(string $reason): string
    {
        return 'metrics:pkce_reject_total:'.$reason;
    }
}

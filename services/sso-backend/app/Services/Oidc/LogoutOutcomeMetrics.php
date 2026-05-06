<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\AtomicCounterStore;

final class LogoutOutcomeMetrics
{
    public function __construct(
        private readonly AtomicCounterStore $counter,
    ) {}

    public function recordSuccess(): void
    {
        $this->counter->increment('metrics:logout_success_total');
    }

    public function recordFailure(string $reason): void
    {
        $this->counter->increment('metrics:logout_failure_total');
        $this->counter->increment($this->failureKey($reason));
    }

    public function successTotal(): int
    {
        return $this->counter->get('metrics:logout_success_total', 0);
    }

    public function failureTotal(): int
    {
        return $this->counter->get('metrics:logout_failure_total', 0);
    }

    public function failureCount(string $reason): int
    {
        return $this->counter->get($this->failureKey($reason), 0);
    }

    private function failureKey(string $reason): string
    {
        return 'metrics:logout_failure_total:'.$reason;
    }
}

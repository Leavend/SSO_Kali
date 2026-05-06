<?php

declare(strict_types=1);

namespace App\Support\Metrics;

use App\Support\Cache\AtomicCounterStore;

/**
 * Abstract base class for metric stores with atomic increment operations.
 * Provides common functionality for counting and tracking metrics.
 */
abstract class AbstractMetricsStore
{
    public function __construct(
        protected readonly AtomicCounterStore $counter,
    ) {}

    /**
     * Increment a counter by name with the given amount.
     */
    protected function increment(string $name, int $amount = 1): void
    {
        $this->counter->increment($this->key($name), $amount);
    }

    /**
     * Get current counter value.
     */
    protected function count(string $name): int
    {
        return $this->counter->get($this->key($name), 0);
    }

    /**
     * Reset a counter to zero.
     */
    protected function reset(string $name): void
    {
        $this->counter->reset($this->key($name));
    }

    /**
     * Get the cache key for a given metric name.
     * Override this method to customize key prefixing.
     */
    protected function key(string $name): string
    {
        return 'metrics:'.$name;
    }
}

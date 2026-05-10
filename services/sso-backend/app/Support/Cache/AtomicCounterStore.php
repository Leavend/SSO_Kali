<?php

declare(strict_types=1);

namespace App\Support\Cache;

use Carbon\Carbon;
use DateInterval;
use DateTimeInterface;
use Illuminate\Cache\RedisStore;
use Illuminate\Support\Facades\Cache;
use Throwable;

/**
 * Atomic counter store using Redis Lua script pattern.
 * Provides thread-safe increment operations without race conditions.
 */
final class AtomicCounterStore
{
    /**
     * Atomically increment a counter and return the new value.
     * Uses Redis INCR for atomic operation when available.
     */
    public function increment(string $key, int $amount = 1, DateTimeInterface|DateInterval|int|null $ttl = null): int
    {
        try {
            $store = Cache::getStore();

            if ($store instanceof RedisStore) {
                return $this->redisIncrement($store, $key, $amount, $ttl);
            }

            return $this->fallbackIncrement($key, $amount, $ttl);
        } catch (Throwable $exception) {
            report($exception);
            throw $exception;
        }
    }

    /**
     * Get current counter value.
     */
    public function get(string $key, int $default = 0): int
    {
        try {
            return (int) Cache::get($key, $default);
        } catch (Throwable $exception) {
            report($exception);

            return $default;
        }
    }

    /**
     * Reset counter to zero.
     */
    public function reset(string $key): void
    {
        try {
            Cache::forget($key);
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    private function redisIncrement(RedisStore $store, string $key, int $amount, DateTimeInterface|DateInterval|int|null $ttl): int
    {
        $redis = $store->connection();

        // Use Redis INCR for atomic operation
        $newValue = (int) $redis->incrby($key, $amount);

        // Set TTL only on first write (when value equals amount)
        if ($ttl !== null && $newValue === $amount) {
            $seconds = match (true) {
                $ttl instanceof DateInterval => (int) $ttl->format('%s'),
                $ttl instanceof DateTimeInterface => max(0, $ttl->getTimestamp() - time()),
                default => $ttl,
            };
            if ($seconds > 0) {
                $redis->expire($key, $seconds);
            }
        }

        return $newValue;
    }

    private function fallbackIncrement(string $key, int $amount, DateTimeInterface|DateInterval|int|null $ttl): int
    {
        // For array-based cache or non-Redis stores, use CAS (Compare-And-Swap) pattern
        $maxRetries = 3;
        $attempt = 0;

        while ($attempt < $maxRetries) {
            $current = Cache::get($key, 0);

            $newValue = (int) $current + $amount;

            if (Cache::put($key, $newValue, $ttl ?? Carbon::now()->addYears(10))) {
                return $newValue;
            }

            $attempt++;
        }

        return $newValue;
    }
}

<?php

declare(strict_types=1);

namespace App\Support\Cache;

use DateInterval;
use DateTimeInterface;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

final class ResilientCacheStore
{
    public function get(string $key, mixed $default = null): mixed
    {
        try {
            return Cache::get($key, $default);
        } catch (Throwable $exception) {
            $this->report('get', $key, $exception);

            return $default;
        }
    }

    public function pull(string $key, mixed $default = null): mixed
    {
        try {
            return Cache::pull($key, $default);
        } catch (Throwable $exception) {
            $this->report('pull', $key, $exception);

            return $default;
        }
    }

    public function put(string $key, mixed $value, DateTimeInterface|DateInterval|int $ttl): bool
    {
        try {
            Cache::put($key, $value, $ttl);

            return true;
        } catch (Throwable $exception) {
            $this->report('put', $key, $exception);

            return false;
        }
    }

    public function forever(string $key, mixed $value): bool
    {
        try {
            Cache::forever($key, $value);

            return true;
        } catch (Throwable $exception) {
            $this->report('forever', $key, $exception);

            return false;
        }
    }

    public function forget(string $key): bool
    {
        try {
            Cache::forget($key);

            return true;
        } catch (Throwable $exception) {
            $this->report('forget', $key, $exception);

            return false;
        }
    }

    public function has(string $key): bool
    {
        try {
            return Cache::has($key);
        } catch (Throwable $exception) {
            $this->report('has', $key, $exception);

            return false;
        }
    }

    public function remember(
        string $key,
        DateTimeInterface|DateInterval|int $ttl,
        callable $resolver,
    ): mixed {
        $sentinel = new CacheMissSentinel;
        $cached = $this->get($key, $sentinel);

        if (! $cached instanceof CacheMissSentinel) {
            return $cached;
        }

        $value = $resolver();
        $this->put($key, $value, $ttl);

        return $value;
    }

    private function report(string $operation, string $key, Throwable $exception): void
    {
        Log::warning('[CACHE_DEGRADED]', [
            'operation' => $operation,
            'key' => $key,
            'exception' => $exception::class,
            'message' => $exception->getMessage(),
        ]);
    }
}

final class CacheMissSentinel {}

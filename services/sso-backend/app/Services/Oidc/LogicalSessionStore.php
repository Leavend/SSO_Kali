<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;
use Illuminate\Support\Str;

final class LogicalSessionStore
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    public function current(string $subjectId): string
    {
        $sessionId = $this->cache->get($this->key($subjectId));

        if (is_string($sessionId) && $sessionId !== '') {
            return $sessionId;
        }

        $sessionId = (string) Str::uuid();
        $this->cache->put($this->key($subjectId), $sessionId, now()->addDays($this->ttlDays()));

        return $sessionId;
    }

    public function clear(string $subjectId, string $sessionId): void
    {
        if ($this->cache->get($this->key($subjectId)) !== $sessionId) {
            return;
        }

        $this->cache->forget($this->key($subjectId));
    }

    private function key(string $subjectId): string
    {
        return 'oidc:logical-session:'.$subjectId;
    }

    private function ttlDays(): int
    {
        return (int) config('sso.ttl.refresh_token_days', 30);
    }
}

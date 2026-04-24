<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;

class AuthRequestStore
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     */
    public function put(array $context): ?string
    {
        $state = bin2hex(random_bytes(24));
        $ttl = (int) config('sso.stores.auth_request_seconds', 300);

        if (! $this->cache->put($this->key($state), $context, $ttl)) {
            return null;
        }

        return $state;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function pull(string $state): ?array
    {
        $context = $this->cache->pull($this->key($state));

        return is_array($context) ? $context : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function peek(string $state): ?array
    {
        $context = $this->cache->get($this->key($state));

        return is_array($context) ? $context : null;
    }

    private function key(string $state): string
    {
        return 'oidc:auth-request:'.$state;
    }
}

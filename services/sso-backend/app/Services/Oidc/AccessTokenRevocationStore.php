<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;

final class AccessTokenRevocationStore
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    public function revoke(string $jti, int $ttl): void
    {
        $this->cache->put($this->key($jti), true, max(1, $ttl));
    }

    public function track(string $sessionId, string $jti, int $expiresAt): void
    {
        $entries = $this->sessionEntries($sessionId);
        $entries[$jti] = $expiresAt;

        $this->cache->put($this->sessionKey($sessionId), $entries, max(1, $expiresAt - time()));
    }

    public function revokeSession(string $sessionId): void
    {
        $entries = $this->sessionEntries($sessionId);

        $this->cache->forget($this->sessionKey($sessionId));

        foreach ($entries as $jti => $expiresAt) {
            $this->revokeTrackedToken($jti, $expiresAt);
        }
    }

    public function revoked(string $jti): bool
    {
        return $this->cache->has($this->key($jti));
    }

    /**
     * @return array<string, int>
     */
    private function sessionEntries(string $sessionId): array
    {
        $entries = $this->cache->get($this->sessionKey($sessionId), []);

        return is_array($entries) ? $entries : [];
    }

    private function revokeTrackedToken(string $jti, mixed $expiresAt): void
    {
        if (! is_int($expiresAt) || $expiresAt <= time()) {
            return;
        }

        $this->revoke($jti, $expiresAt - time());
    }

    private function key(string $jti): string
    {
        return 'oidc:revoked-access-token:'.$jti;
    }

    private function sessionKey(string $sessionId): string
    {
        return 'oidc:session-access-tokens:'.$sessionId;
    }
}

<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;

final class BackChannelSessionRegistry
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    public function register(string $sessionId, string $clientId, string $logoutUri): void
    {
        $registrations = $this->keyedRegistrations($sessionId);
        $registrations[$clientId] = [
            'client_id' => $clientId,
            'backchannel_logout_uri' => $logoutUri,
        ];

        $this->cache->put($this->key($sessionId), array_values($registrations), now()->addDays($this->ttlDays()));
    }

    /**
     * @return list<array<string, string>>
     */
    public function forSession(string $sessionId): array
    {
        $registrations = $this->cache->get($this->key($sessionId), []);

        return is_array($registrations) ? array_values(array_filter($registrations, 'is_array')) : [];
    }

    public function clear(string $sessionId): void
    {
        $this->cache->forget($this->key($sessionId));
    }

    /**
     * @return array<string, array<string, string>>
     */
    private function keyedRegistrations(string $sessionId): array
    {
        $registrations = [];

        foreach ($this->forSession($sessionId) as $registration) {
            $registrations[(string) $registration['client_id']] = $registration;
        }

        return $registrations;
    }

    private function key(string $sessionId): string
    {
        return 'oidc:backchannel-session:'.$sessionId;
    }

    private function ttlDays(): int
    {
        return (int) config('sso.ttl.refresh_token_days', 30);
    }
}

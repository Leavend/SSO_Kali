<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;

final class BackChannelSessionRegistry
{
    public function __construct(
        private readonly ResilientCacheStore $cache,
    ) {}

    /**
     * @param  array<string, mixed>  $metadata
     */
    public function register(string $sessionId, string $clientId, string $logoutUri, array $metadata = []): void
    {
        $registrations = $this->keyedRegistrations($sessionId);
        $registrations[$clientId] = $this->registrationPayload($clientId, $logoutUri, $metadata);

        $this->cache->put($this->key($sessionId), array_values($registrations), now()->addDays($this->ttlDays()));
    }

    /**
     * @return list<array<string, mixed>>
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
     * @return array<string, array<string, mixed>>
     */
    private function keyedRegistrations(string $sessionId): array
    {
        $registrations = [];

        foreach ($this->forSession($sessionId) as $registration) {
            $clientId = $this->clientId($registration);

            if ($clientId !== null) {
                $registrations[$clientId] = $registration;
            }
        }

        return $registrations;
    }

    /**
     * @param  array<string, mixed>  $registration
     */
    private function clientId(array $registration): ?string
    {
        return is_string($registration['client_id'] ?? null) && $registration['client_id'] !== ''
            ? $registration['client_id']
            : null;
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @return array<string, mixed>
     */
    private function registrationPayload(string $clientId, string $logoutUri, array $metadata): array
    {
        return array_filter([
            'client_id' => $clientId,
            'backchannel_logout_uri' => $logoutUri,
            'subject_id' => $metadata['subject_id'] ?? null,
            'scope' => $metadata['scope'] ?? null,
            'created_at' => $metadata['created_at'] ?? null,
            'expires_at' => $metadata['expires_at'] ?? null,
        ], static fn (mixed $value): bool => $value !== null);
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

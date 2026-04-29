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
        $this->rememberSubjectSession($sessionId, $metadata);
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
        $registrations = $this->forSession($sessionId);

        $this->cache->forget($this->key($sessionId));
        $this->removeSubjectSessions($sessionId, $registrations);
    }

    /**
     * @return list<string>
     */
    public function sessionIdsForSubject(string $subjectId): array
    {
        $sessions = $this->cache->get($this->subjectKey($subjectId), []);

        return array_values(array_filter(is_array($sessions) ? $sessions : [], 'is_string'));
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

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function rememberSubjectSession(string $sessionId, array $metadata): void
    {
        $subjectId = $this->stringValue($metadata, 'subject_id');
        if ($subjectId === null) {
            return;
        }

        $sessions = $this->sessionIdsForSubject($subjectId);
        in_array($sessionId, $sessions, true) || $sessions[] = $sessionId;

        $this->cache->put($this->subjectKey($subjectId), $sessions, now()->addDays($this->ttlDays()));
    }

    /**
     * @param  list<array<string, mixed>>  $registrations
     */
    private function removeSubjectSessions(string $sessionId, array $registrations): void
    {
        foreach ($this->subjectIds($registrations) as $subjectId) {
            $sessions = array_values(array_diff($this->sessionIdsForSubject($subjectId), [$sessionId]));
            $sessions === []
                ? $this->cache->forget($this->subjectKey($subjectId))
                : $this->cache->put($this->subjectKey($subjectId), $sessions, now()->addDays($this->ttlDays()));
        }
    }

    /**
     * @param  list<array<string, mixed>>  $registrations
     * @return list<string>
     */
    private function subjectIds(array $registrations): array
    {
        return array_values(array_unique(array_filter(array_map(
            fn (array $registration): ?string => $this->stringValue($registration, 'subject_id'),
            $registrations,
        ))));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function stringValue(array $payload, string $key): ?string
    {
        $value = $payload[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    private function key(string $sessionId): string
    {
        return 'oidc:backchannel-session:'.$sessionId;
    }

    private function subjectKey(string $subjectId): string
    {
        return 'oidc:backchannel-subject:'.$subjectId;
    }

    private function ttlDays(): int
    {
        return (int) config('sso.ttl.refresh_token_days', 30);
    }
}

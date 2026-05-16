<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Support\Cache\ResilientCacheStore;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * BE-FR040-001 — Persistent RP Session Registry.
 *
 * Source of truth is the `oidc_rp_sessions` table (created by the
 * 2026_05_16 migration). The {@see ResilientCacheStore} layer remains
 * for fan-out hot-path acceleration but is now strictly an alongside
 * cache: it can be evicted without losing RP back-channel logout
 * targets, public clients without refresh tokens still surface in
 * profile/admin session lists, and front-channel logout fallback
 * (FR-043) has a stable place to read `frontchannel_logout_uri` from.
 *
 * Public surface stays compatible with previous callers:
 * `register()`, `forSession()`, `clear()`, `sessionIdsForSubject()`.
 */
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
        $now = CarbonImmutable::now();
        $expiresAt = $this->expiresAt($metadata, $now);

        $payload = [
            'sid' => $sessionId,
            'client_id' => $clientId,
            'subject_id' => $this->stringValue($metadata, 'subject_id'),
            'backchannel_logout_uri' => $logoutUri !== '' ? $logoutUri : null,
            'frontchannel_logout_uri' => $this->stringValue($metadata, 'frontchannel_logout_uri'),
            'channels' => $this->channels($metadata),
            'scope' => $this->stringValue($metadata, 'scope'),
            'created_at' => $now,
            'last_seen_at' => $now,
            'expires_at' => $expiresAt,
            'revoked_at' => null,
        ];

        $existing = DB::table('oidc_rp_sessions')
            ->where('sid', $sessionId)
            ->where('client_id', $clientId)
            ->first();

        if ($existing === null) {
            DB::table('oidc_rp_sessions')->insert($payload);
        } else {
            DB::table('oidc_rp_sessions')
                ->where('id', $existing->id)
                ->update([
                    ...array_diff_key($payload, ['created_at' => null]),
                    'created_at' => $existing->created_at ?? $now,
                ]);
        }

        $this->refreshSessionCache($sessionId);
        $this->refreshSubjectCache($payload['subject_id']);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function forSession(string $sessionId): array
    {
        $cached = $this->cache->get($this->key($sessionId));

        if (is_array($cached)) {
            return array_values(array_filter($cached, 'is_array'));
        }

        $rows = $this->activeRowsForSession($sessionId);
        $this->cache->put($this->key($sessionId), $rows, now()->addDays($this->ttlDays()));

        return $rows;
    }

    public function clear(string $sessionId): void
    {
        $rows = $this->activeRowsForSession($sessionId);

        DB::table('oidc_rp_sessions')
            ->where('sid', $sessionId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => CarbonImmutable::now()]);

        $this->cache->forget($this->key($sessionId));

        foreach ($this->subjectIds($rows) as $subjectId) {
            $this->refreshSubjectCache($subjectId);
        }
    }

    /**
     * @return list<string>
     */
    public function sessionIdsForSubject(string $subjectId): array
    {
        $cached = $this->cache->get($this->subjectKey($subjectId));

        if (is_array($cached)) {
            return array_values(array_filter($cached, 'is_string'));
        }

        $sessions = $this->activeSessionIdsForSubject($subjectId);
        $this->cache->put($this->subjectKey($subjectId), $sessions, now()->addDays($this->ttlDays()));

        return $sessions;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function activeRowsForSession(string $sessionId): array
    {
        return DB::table('oidc_rp_sessions')
            ->where('sid', $sessionId)
            ->whereNull('revoked_at')
            ->orderBy('client_id')
            ->get()
            ->map(fn (object $row): array => $this->rowPayload($row))
            ->all();
    }

    /**
     * @return list<string>
     */
    private function activeSessionIdsForSubject(string $subjectId): array
    {
        return DB::table('oidc_rp_sessions')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->orderByDesc('last_seen_at')
            ->pluck('sid')
            ->map(fn (mixed $value): string => (string) $value)
            ->unique()
            ->values()
            ->all();
    }

    private function refreshSessionCache(string $sessionId): void
    {
        $rows = $this->activeRowsForSession($sessionId);
        $this->cache->put($this->key($sessionId), $rows, now()->addDays($this->ttlDays()));
    }

    private function refreshSubjectCache(?string $subjectId): void
    {
        if ($subjectId === null) {
            return;
        }

        $sessions = $this->activeSessionIdsForSubject($subjectId);

        $sessions === []
            ? $this->cache->forget($this->subjectKey($subjectId))
            : $this->cache->put($this->subjectKey($subjectId), $sessions, now()->addDays($this->ttlDays()));
    }

    /**
     * @return array<string, mixed>
     */
    private function rowPayload(object $row): array
    {
        return array_filter([
            'client_id' => is_string($row->client_id ?? null) ? $row->client_id : null,
            'backchannel_logout_uri' => is_string($row->backchannel_logout_uri ?? null) && $row->backchannel_logout_uri !== ''
                ? $row->backchannel_logout_uri
                : null,
            'frontchannel_logout_uri' => is_string($row->frontchannel_logout_uri ?? null) && $row->frontchannel_logout_uri !== ''
                ? $row->frontchannel_logout_uri
                : null,
            'channels' => is_string($row->channels ?? null) && $row->channels !== '' ? $row->channels : 'backchannel',
            'subject_id' => is_string($row->subject_id ?? null) && $row->subject_id !== '' ? $row->subject_id : null,
            'scope' => is_string($row->scope ?? null) && $row->scope !== '' ? $row->scope : null,
            'created_at' => is_string($row->created_at ?? null) ? $row->created_at : null,
            'expires_at' => is_string($row->expires_at ?? null) ? $row->expires_at : null,
        ], static fn (mixed $value): bool => $value !== null);
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function expiresAt(array $metadata, CarbonImmutable $now): CarbonImmutable
    {
        $value = $metadata['expires_at'] ?? null;

        if (is_string($value) && $value !== '') {
            try {
                return CarbonImmutable::parse($value);
            } catch (\Throwable) {
                // fall through to default below
            }
        }

        return $now->addDays($this->ttlDays());
    }

    /**
     * @param  array<string, mixed>  $metadata
     */
    private function channels(array $metadata): string
    {
        $value = $metadata['channels'] ?? null;

        if (is_string($value) && $value !== '') {
            return $value;
        }

        if (is_array($value)) {
            $filtered = array_values(array_filter($value, static fn (mixed $entry): bool => is_string($entry) && $entry !== ''));
            if ($filtered !== []) {
                return implode(',', $filtered);
            }
        }

        return 'backchannel';
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return list<string>
     */
    private function subjectIds(array $rows): array
    {
        return array_values(array_unique(array_filter(array_map(
            fn (array $row): ?string => $this->stringValue($row, 'subject_id'),
            $rows,
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

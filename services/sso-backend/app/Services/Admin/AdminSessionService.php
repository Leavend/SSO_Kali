<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\BackChannelLogoutDispatcher;
use App\Services\Oidc\BackChannelSessionRegistry;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class AdminSessionService
{
    public function __construct(
        private readonly BackChannelSessionRegistry $sessionRegistry,
        private readonly AccessTokenRevocationStore $tokenStore,
        private readonly BackChannelLogoutDispatcher $dispatcher,
    ) {}

    /**
     * List all active sessions from the refresh_token_rotations table,
     * grouped with user information.
     *
     * @return list<array<string, mixed>>
     */
    public function activeSessions(): array
    {
        $sessions = $this->activeSessionRows()
            ->unique(fn (object $row): string => $this->sessionKey($row))
            ->map(fn (object $row): array => $this->sessionPayload($row))
            ->values();

        return $this->withRegisteredClientSessions($sessions)
            ->sortByDesc(fn (array $session): int => strtotime((string) $session['created_at']) ?: 0)
            ->values()
            ->all();
    }

    /**
     * List active sessions for a specific user.
     *
     * @return list<array<string, mixed>>
     */
    public function sessionsForUser(string $subjectId): array
    {
        return collect($this->activeSessions())
            ->filter(fn (array $session): bool => $session['subject_id'] === $subjectId)
            ->values()
            ->all();
    }

    /**
     * Revoke a single logical session — kills all refresh tokens, access tokens,
     * and fans out back-channel logout to registered clients.
     *
     * @return array{revoked_tokens: int, backchannel_fanout: int}
     */
    public function revokeSession(string $sessionId): array
    {
        $revokedTokens = $this->revokeRefreshTokens($sessionId);
        $this->tokenStore->revokeSession($sessionId);
        $fanout = $this->fanoutBackChannelLogout($sessionId);

        return ['revoked_tokens' => $revokedTokens, 'backchannel_fanout' => $fanout];
    }

    /**
     * Revoke ALL sessions for a user across all clients.
     *
     * @return array{sessions_revoked: int, total_tokens: int}
     */
    public function revokeAllUserSessions(string $subjectId): array
    {
        $sessions = $this->sessionsForUser($subjectId);
        $totalTokens = 0;

        foreach ($sessions as $session) {
            $result = $this->revokeSession((string) $session['session_id']);
            $totalTokens += $result['revoked_tokens'];
        }

        return ['sessions_revoked' => count($sessions), 'total_tokens' => $totalTokens];
    }

    private function revokeRefreshTokens(string $sessionId): int
    {
        return DB::table('refresh_token_rotations')
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    private function fanoutBackChannelLogout(string $sessionId): int
    {
        $registrations = $this->sessionRegistry->forSession($sessionId);
        $subjectId = $this->subjectForSession($sessionId);
        $results = $this->dispatcher->dispatch($subjectId, $sessionId, $registrations);

        $this->sessionRegistry->clear($sessionId);

        return count($results);
    }

    private function subjectForSession(string $sessionId): string
    {
        $record = DB::table('refresh_token_rotations')
            ->where('session_id', $sessionId)
            ->first();

        return $record !== null ? (string) $record->subject_id : 'unknown';
    }

    /**
     * @return Collection<int, \stdClass>
     */
    private function activeSessionRows(): Collection
    {
        return DB::table('refresh_token_rotations as r')
            ->join('users as u', 'u.subject_id', '=', 'r.subject_id')
            ->whereNull('r.revoked_at')
            ->where('r.expires_at', '>', now())
            ->whereNull('r.replaced_by_token_id')
            ->select([
                'r.session_id',
                'r.client_id',
                'r.subject_id',
                'r.scope',
                'r.created_at',
                'r.expires_at',
                'u.email',
                'u.display_name',
            ])
            ->orderByDesc('r.created_at')
            ->get();
    }

    private function sessionKey(object $row): string
    {
        return (string) $row->session_id.'|'.(string) $row->client_id;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $sessions
     * @return Collection<int, array<string, mixed>>
     */
    private function withRegisteredClientSessions(Collection $sessions): Collection
    {
        $merged = collect($sessions->all());
        $known = $merged->keyBy(fn (array $session): string => $this->payloadKey($session));

        foreach ($this->sessionIds($sessions) as $sessionId) {
            $this->appendRegisteredClients($merged, $known, $sessionId);
        }

        return $merged;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $sessions
     * @return list<string>
     */
    private function sessionIds(Collection $sessions): array
    {
        return $sessions
            ->pluck('session_id')
            ->filter(fn (mixed $id): bool => is_string($id) && $id !== '')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $merged
     * @param  Collection<string, array<string, mixed>>  $known
     */
    private function appendRegisteredClients(Collection $merged, Collection $known, string $sessionId): void
    {
        foreach ($this->sessionRegistry->forSession($sessionId) as $registration) {
            $this->appendRegisteredClient($merged, $known, $sessionId, $registration);
        }
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $merged
     * @param  Collection<string, array<string, mixed>>  $known
     * @param  array<string, mixed>  $registration
     */
    private function appendRegisteredClient(Collection $merged, Collection $known, string $sessionId, array $registration): void
    {
        $payload = $this->registeredClientPayload($merged, $sessionId, $registration);
        if ($payload === null || $known->has($this->payloadKey($payload))) {
            return;
        }

        $known->put($this->payloadKey($payload), $payload);
        $merged->push($payload);
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $sessions
     * @param  array<string, mixed>  $registration
     * @return array<string, mixed>|null
     */
    private function registeredClientPayload(Collection $sessions, string $sessionId, array $registration): ?array
    {
        $base = $this->sessionBasePayload($sessions, $sessionId);
        $clientId = $this->stringValue($registration, 'client_id');
        if ($base === null || $clientId === null) {
            return null;
        }

        if (! $this->sameSubject($base, $registration) || ! $this->registrationIsActive($registration)) {
            return null;
        }

        return $this->registeredPayload($base, $registration, $clientId);
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $registration
     */
    private function sameSubject(array $base, array $registration): bool
    {
        $registeredSubject = $this->stringValue($registration, 'subject_id');
        $baseSubject = $this->stringValue($base, 'subject_id');

        return $registeredSubject === null || $baseSubject === null || $registeredSubject === $baseSubject;
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $sessions
     * @return array<string, mixed>|null
     */
    private function sessionBasePayload(Collection $sessions, string $sessionId): ?array
    {
        return $sessions->first(
            fn (array $session): bool => ($session['session_id'] ?? null) === $sessionId,
        );
    }

    /**
     * @param  array<string, mixed>  $base
     * @param  array<string, mixed>  $registration
     * @return array<string, mixed>
     */
    private function registeredPayload(array $base, array $registration, string $clientId): array
    {
        return [
            ...$base,
            'client_id' => $clientId,
            'scope' => $this->stringValue($registration, 'scope') ?? $base['scope'],
            'created_at' => $this->stringValue($registration, 'created_at') ?? $base['created_at'],
            'expires_at' => $this->stringValue($registration, 'expires_at') ?? $base['expires_at'],
        ];
    }

    /**
     * @param  array<string, mixed>  $registration
     */
    private function registrationIsActive(array $registration): bool
    {
        $expiresAt = $this->stringValue($registration, 'expires_at');

        return $expiresAt === null || strtotime($expiresAt) > time();
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function payloadKey(array $payload): string
    {
        return (string) $payload['session_id'].'|'.(string) $payload['client_id'];
    }

    /**
     * @param  array<string, mixed>  $values
     */
    private function stringValue(array $values, string $key): ?string
    {
        return is_string($values[$key] ?? null) && $values[$key] !== '' ? $values[$key] : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function sessionPayload(object $row): array
    {
        return [
            'session_id' => $row->session_id,
            'client_id' => $row->client_id,
            'subject_id' => $row->subject_id,
            'email' => $row->email,
            'display_name' => $row->display_name,
            'scope' => $row->scope,
            'created_at' => $row->created_at,
            'expires_at' => $row->expires_at,
        ];
    }
}

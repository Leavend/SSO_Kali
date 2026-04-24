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
        return $this->activeSessionRows()
            ->unique(fn (object $row): string => $this->sessionKey($row))
            ->map(fn (object $row): array => $this->sessionPayload($row))
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

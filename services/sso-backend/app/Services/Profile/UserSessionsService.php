<?php

declare(strict_types=1);

namespace App\Services\Profile;

use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class UserSessionsService
{
    /**
     * @return list<array<string, mixed>>
     */
    public function listForSubject(string $subjectId): array
    {
        $oauthSessions = DB::table('refresh_token_rotations')
            ->select(['session_id', 'client_id', 'created_at', 'updated_at', 'expires_at'])
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->get();

        $rpSessions = DB::table('oidc_rp_sessions')
            ->select(['sid as session_id', 'client_id', 'created_at', 'last_seen_at as updated_at', 'expires_at'])
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->get();

        $aggregated = $this->aggregateBySession($oauthSessions->merge($rpSessions));

        $portalSessions = DB::table('sso_sessions')
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->orderByDesc('last_seen_at')
            ->get()
            ->map(fn (object $row): array => [
                'session_id' => $row->session_id,
                'opened_at' => str_replace(' ', 'T', (string) $row->authenticated_at).'Z',
                'last_used_at' => str_replace(' ', 'T', (string) $row->last_seen_at).'Z',
                'expires_at' => str_replace(' ', 'T', (string) $row->expires_at).'Z',
                'ip_address' => $row->ip_address,
                'user_agent' => $row->user_agent,
                'client_count' => 1,
                'client_ids' => ['sso-portal'],
                'client_display_names' => ['SSO Portal'],
                'type' => 'portal',
                'revoke_reason' => null,
            ])
            ->all();

        return array_merge($portalSessions, $aggregated);
    }

    public function belongsToSubject(string $subjectId, string $sessionId): bool
    {
        $inOauthSessions = DB::table('refresh_token_rotations')
            ->where('subject_id', $subjectId)
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->exists();

        if ($inOauthSessions) {
            return true;
        }

        return DB::table('sso_sessions')
            ->where('subject_id', $subjectId)
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->exists();
    }

    /**
     * Revoke a portal session in the sso_sessions table.
     * Returns the number of rows affected (0 or 1).
     */
    public function revokePortalSession(string $sessionId): int
    {
        return DB::table('sso_sessions')
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    /**
     * Aggregasi dilakukan di PHP untuk portability antar driver (MySQL/Postgres/SQLite).
     * Volume data per user terbatas (puluhan session aktif maksimal) sehingga biaya rendah.
     *
     * @param  Collection<int, \stdClass>  $rows
     * @return list<array<string, mixed>>
     */
    private function aggregateBySession(Collection $rows): array
    {
        return $rows
            ->groupBy(fn (object $row): string => (string) $row->session_id)
            ->map(fn (Collection $group, string $sessionId): array => $this->buildSession($sessionId, $group))
            ->sortByDesc(fn (array $session): string => (string) $session['last_used_at'])
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, \stdClass>  $group
     * @return array<string, mixed>
     */
    private function buildSession(string $sessionId, Collection $group): array
    {
        $clientIds = $group
            ->pluck('client_id')
            ->map(fn (mixed $value): string => (string) $value)
            ->unique()
            ->sort()
            ->values()
            ->all();

        return [
            'session_id' => $sessionId,
            'opened_at' => $this->iso($group->min('created_at')),
            'last_used_at' => $this->iso($group->max('updated_at')),
            'expires_at' => $this->iso($group->max('expires_at')),
            'ip_address' => null,
            'user_agent' => null,
            'type' => 'rp',
            'revoke_reason' => null,
            'client_count' => count($clientIds),
            'client_ids' => $clientIds,
            'client_display_names' => array_map(
                fn (string $clientId): string => $this->displayName($clientId),
                $clientIds,
            ),
        ];
    }

    private function iso(mixed $value): string
    {
        return str_replace(' ', 'T', (string) $value).'Z';
    }

    private function displayName(string $clientId): string
    {
        $configured = config("oidc_clients.clients.{$clientId}.display_name");

        return is_string($configured) && $configured !== '' ? $configured : $clientId;
    }
}

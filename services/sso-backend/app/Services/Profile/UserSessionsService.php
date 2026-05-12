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
        $rows = DB::table('refresh_token_rotations')
            ->select(['session_id', 'client_id', 'created_at', 'updated_at', 'expires_at'])
            ->where('subject_id', $subjectId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', now())
            ->get();

        return $this->aggregateBySession($rows);
    }

    public function belongsToSubject(string $subjectId, string $sessionId): bool
    {
        return DB::table('refresh_token_rotations')
            ->where('subject_id', $subjectId)
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->exists();
    }

    /**
     * Aggregasi dilakukan di PHP untuk portability antar driver (MySQL/Postgres/SQLite).
     * Volume data per user terbatas (puluhan session aktif maksimal) sehingga biaya rendah.
     *
     * @param  Collection<int, object>  $rows
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
     * @param  Collection<int, object>  $group
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
            'opened_at' => (string) $group->min('created_at'),
            'last_used_at' => (string) $group->max('updated_at'),
            'expires_at' => (string) $group->max('expires_at'),
            'client_count' => count($clientIds),
            'client_ids' => $clientIds,
            'client_display_names' => array_map(
                fn (string $clientId): string => $this->displayName($clientId),
                $clientIds,
            ),
        ];
    }

    private function displayName(string $clientId): string
    {
        $configured = config("oidc_clients.clients.{$clientId}.display_name");

        return is_string($configured) && $configured !== '' ? $configured : $clientId;
    }
}

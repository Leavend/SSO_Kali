<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Directory\DirectoryUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class SsoSessionRepository
{
    public function createForDirectoryUser(DirectoryUser $user, ?string $ipAddress, ?string $userAgent): SsoSession
    {
        return $this->create($user->id, $user->subjectId, $ipAddress, $userAgent);
    }

    public function createForUser(User $user, ?string $ipAddress, ?string $userAgent): SsoSession
    {
        return $this->create((int) $user->getKey(), $user->subject_id, $ipAddress, $userAgent);
    }

    public function findActiveBySessionId(string $sessionId): ?SsoSession
    {
        if ($sessionId === '') {
            return null;
        }

        $session = SsoSession::query()
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->first();

        return $session instanceof SsoSession ? $session : null;
    }

    /**
     * BE-FR039-001: row-locked variant used by the lifecycle gate so the
     * read + downstream revoke/touch happen atomically. Callers MUST
     * already be inside a transaction.
     */
    public function lockActiveBySessionId(string $sessionId): ?SsoSession
    {
        if ($sessionId === '') {
            return null;
        }

        $session = SsoSession::query()
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->lockForUpdate()
            ->first();

        return $session instanceof SsoSession ? $session : null;
    }

    private function create(int $userId, string $subjectId, ?string $ipAddress, ?string $userAgent): SsoSession
    {
        $now = now();

        return SsoSession::query()->create([
            'session_id' => (string) Str::uuid(),
            'user_id' => $userId,
            'subject_id' => $subjectId,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'authenticated_at' => $now,
            'last_seen_at' => $now,
            'expires_at' => $now->copy()->addMinutes((int) config('sso.session.ttl_minutes', 480)),
        ]);
    }

    public function touchLastSeen(SsoSession $session): void
    {
        $session->forceFill(['last_seen_at' => now()])->save();
    }

    public function revoke(SsoSession $session): void
    {
        if ($session->revoked_at instanceof Carbon) {
            return;
        }

        $session->forceFill(['revoked_at' => now()])->save();
    }
}

<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Models\SsoSession;
use App\Services\Directory\DirectoryUser;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class SsoSessionRepository
{
    public function createForDirectoryUser(DirectoryUser $user, ?string $ipAddress, ?string $userAgent): SsoSession
    {
        $now = now();

        return SsoSession::query()->create([
            'session_id' => (string) Str::uuid(),
            'user_id' => $user->id,
            'subject_id' => $user->subjectId,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'authenticated_at' => $now,
            'last_seen_at' => $now,
            'expires_at' => $now->copy()->addMinutes((int) config('sso.session.ttl_minutes', 480)),
        ]);
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

<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Directory\DirectoryUser;
use App\Services\Profile\TrustedDevicesService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class SsoSessionRepository
{
    /**
     * Passive heartbeat throttle. last_seen_at is a coarse "last seen" marker, so
     * a touch within this window of the previous one is skipped — this collapses
     * the redundant second UPDATE when a trusted browser mutation already wrote
     * last_seen_at via the activity path before session resolution touches it.
     */
    private const int LAST_SEEN_THROTTLE_SECONDS = 15;

    public function __construct(private readonly TrustedDevicesService $devices) {}

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
     * Row-locked variant used by the lifecycle gate so the read + downstream
     * revoke/touch happen atomically. Callers MUST already be inside a
     * transaction.
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
        return DB::transaction(function () use ($userId, $subjectId, $ipAddress, $userAgent): SsoSession {
            $now = now();
            $expiresAt = $now->copy()->addMinutes((int) config('sso.session.ttl_minutes', 480));
            $device = $this->devices->remember($userId, $subjectId, $ipAddress, $userAgent);
            $active = SsoSession::query()
                ->where('user_id', $userId)
                ->where('trusted_device_id', $device->id)
                ->whereNull('revoked_at')
                ->where('expires_at', '>', $now)
                ->orderByDesc('last_seen_at')
                ->lockForUpdate()
                ->first();

            if ($active instanceof SsoSession) {
                $active->forceFill([
                    'subject_id' => $subjectId,
                    'ip_address' => $ipAddress,
                    'user_agent' => $userAgent,
                    'authenticated_at' => $now,
                    'last_seen_at' => $now,
                    'activity_seen_at' => $now,
                    'expires_at' => $expiresAt,
                ])->save();

                return $active;
            }

            return SsoSession::query()->create([
                'session_id' => (string) Str::uuid(),
                'user_id' => $userId,
                'subject_id' => $subjectId,
                'ip_address' => $ipAddress,
                'user_agent' => $userAgent,
                'trusted_device_id' => $device->id,
                'authenticated_at' => $now,
                'last_seen_at' => $now,
                'activity_seen_at' => $now,
                'expires_at' => $expiresAt,
            ]);
        });
    }

    public function touchLastSeen(SsoSession $session): void
    {
        $lastSeen = $session->last_seen_at;

        if ($lastSeen instanceof Carbon
            && now()->getTimestamp() - $lastSeen->getTimestamp() < self::LAST_SEEN_THROTTLE_SECONDS) {
            return;
        }

        $session->forceFill(['last_seen_at' => now()])->save();
    }

    /**
     * Bump the activity clock for an absolutely-valid session (not revoked, not
     * past its absolute TTL) without applying the idle check. Used by the SSO
     * authorize/consent flow to record deliberate SSO usage as activity — an
     * already-idle-but-not-yet-revoked row is refreshed rather than killed.
     */
    public function recordActivityBySessionId(string $sessionId): void
    {
        $now = now();

        SsoSession::query()
            ->where('session_id', $sessionId)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', $now)
            ->update([
                'last_seen_at' => $now,
                'activity_seen_at' => $now,
                'updated_at' => $now,
            ]);
    }

    public function revoke(SsoSession $session): void
    {
        if ($session->revoked_at instanceof Carbon) {
            return;
        }

        $session->forceFill(['revoked_at' => now()])->save();
    }
}

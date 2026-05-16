<?php

declare(strict_types=1);

namespace App\Services\Session;

use App\Models\SsoSession;
use App\Models\User;
use App\Repositories\SsoSessionRepository;
use App\Repositories\UserRepository;
use App\Services\Directory\DirectoryUser;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final class SsoSessionService
{
    public function __construct(
        private readonly SsoSessionRepository $sessions,
        private readonly UserRepository $users,
    ) {}

    public function create(DirectoryUser $user, ?string $ipAddress, ?string $userAgent): SsoSession
    {
        return $this->sessions->createForDirectoryUser($user, $ipAddress, $userAgent);
    }

    public function current(?string $sessionId): ?SsoSession
    {
        if (! is_string($sessionId) || $sessionId === '') {
            return null;
        }

        return $this->resolveActive($sessionId);
    }

    public function currentUser(?string $sessionId): ?User
    {
        $session = $this->current($sessionId);

        if (! $session instanceof SsoSession) {
            return null;
        }

        return $this->users->findById((int) $session->user_id);
    }

    public function revoke(SsoSession $session): void
    {
        $this->sessions->revoke($session);
    }

    public function revokeCurrent(?string $sessionId): void
    {
        $session = $this->current($sessionId);

        if ($session instanceof SsoSession) {
            $this->revoke($session);
        }
    }

    /**
     * BE-FR039-001 — race-safe lifecycle gate.
     *
     * Reads, validates, and updates the SSO session row inside a single
     * transaction with `lockForUpdate()` so a concurrent revoke / heartbeat
     * cannot extend an idle-expired session that another request just
     * decided to revoke (and vice versa).
     */
    private function resolveActive(string $sessionId): ?SsoSession
    {
        return DB::transaction(function () use ($sessionId): ?SsoSession {
            $session = $this->sessions->lockActiveBySessionId($sessionId);

            if (! $session instanceof SsoSession) {
                return null;
            }

            if ($session->expires_at->isPast()) {
                $this->sessions->revoke($session);

                return null;
            }

            $idleMinutes = (int) config('sso.session.idle_minutes', 30);

            if ($idleMinutes > 0 && $this->isIdle($session, $idleMinutes)) {
                $this->sessions->revoke($session);

                return null;
            }

            $this->sessions->touchLastSeen($session);

            return $session;
        });
    }

    private function isIdle(SsoSession $session, int $idleMinutes): bool
    {
        $lastSeen = $session->last_seen_at instanceof \DateTimeInterface
            ? CarbonImmutable::instance($session->last_seen_at)
            : null;

        if ($lastSeen === null) {
            return false;
        }

        return $lastSeen->addMinutes($idleMinutes)->isPast();
    }
}

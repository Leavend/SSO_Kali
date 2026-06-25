<?php

declare(strict_types=1);

namespace App\Services\Session;

use App\Models\SsoSession;
use App\Models\User;
use App\Repositories\SsoSessionRepository;
use App\Repositories\UserRepository;
use App\Services\Directory\DirectoryUser;
use App\Services\Oidc\DeviceSessionRegistry;
use App\Support\Session\SessionIdlePolicy;
use Illuminate\Support\Facades\DB;

final class SsoSessionService
{
    public function __construct(
        private readonly SsoSessionRepository $sessions,
        private readonly UserRepository $users,
        private readonly DeviceSessionRegistry $deviceSessions,
        private readonly SessionIdlePolicy $idlePolicy,
    ) {}

    public function create(DirectoryUser $user, ?string $ipAddress, ?string $userAgent): SsoSession
    {
        return $this->sessions->createForDirectoryUser($user, $ipAddress, $userAgent);
    }

    public function createForUser(User $user, ?string $ipAddress, ?string $userAgent): SsoSession
    {
        return $this->sessions->createForUser($user, $ipAddress, $userAgent);
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

    /**
     * Resolve the session for a PASSIVE widget read without the idle-revoke path.
     *
     * Viewing the account bar (session / accounts / apps polling, or reading the
     * current session before an account switch) must not permanently revoke an
     * idle-but-absolutely-valid session. Idle expiry is enforced where the
     * session is actively USED — the /authorize + consent flow and explicit
     * logout go through current()/resolveActive() and still revoke on idle. A
     * passive read returns the session when it is present, not revoked, and
     * within its absolute TTL; it never mutates the row.
     */
    public function peekActive(?string $sessionId): ?SsoSession
    {
        if (! is_string($sessionId) || $sessionId === '') {
            return null;
        }

        $session = $this->sessions->findActiveBySessionId($sessionId);

        if (! $session instanceof SsoSession || $session->expires_at->isPast()) {
            return null;
        }

        return $session;
    }

    public function peekActiveUser(?string $sessionId): ?User
    {
        $session = $this->peekActive($sessionId);

        if (! $session instanceof SsoSession) {
            return null;
        }

        return $this->users->findById((int) $session->user_id);
    }

    public function revoke(SsoSession $session): void
    {
        $this->sessions->revoke($session);
        $this->deviceSessions->forgetSession($session->session_id);
    }

    public function revokeCurrent(?string $sessionId): void
    {
        $session = $this->current($sessionId);

        if ($session instanceof SsoSession) {
            $this->revoke($session);
        }
    }

    /**
     * Record deliberate SSO usage (a browser-session /authorize, consent code
     * issuance, or a trusted browser mutation) as activity so an actively-SSO-ing
     * user does not idle-expire between explicit auth/mfa/profile actions.
     *
     * Refreshes the absolutely-valid session (not revoked, not past its absolute
     * TTL) in place without the idle-revoke path, so a session that is merely
     * past its idle window is renewed rather than killed.
     */
    public function recordSsoActivity(?string $sessionId): void
    {
        if (! is_string($sessionId) || $sessionId === '') {
            return;
        }

        $this->sessions->recordActivityBySessionId($sessionId);
    }

    /**
     * Race-safe session lifecycle gate.
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

            if ($this->idlePolicy->isIdle($session)) {
                $this->sessions->revoke($session);

                return null;
            }

            $this->sessions->touchLastSeen($session);

            return $session;
        });
    }
}

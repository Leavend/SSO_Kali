<?php

declare(strict_types=1);

namespace App\Services\Session;

use App\Models\SsoSession;
use App\Models\User;
use App\Repositories\SsoSessionRepository;
use App\Repositories\UserRepository;
use App\Services\Directory\DirectoryUser;

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

        $session = $this->sessions->findActiveBySessionId($sessionId);

        if (! $session instanceof SsoSession) {
            return null;
        }

        if ($session->expires_at->isPast()) {
            $this->revoke($session);

            return null;
        }

        $this->sessions->touchLastSeen($session);

        return $session;
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
}

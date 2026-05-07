<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Services\Session\SsoSessionService;

final readonly class LogoutSsoSessionAction
{
    public function __construct(private SsoSessionService $sessions) {}

    public function execute(?string $sessionId): void
    {
        $this->sessions->revokeCurrent($sessionId);
    }
}

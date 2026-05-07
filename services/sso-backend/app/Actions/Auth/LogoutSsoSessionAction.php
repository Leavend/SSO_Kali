<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Models\SsoSession;
use App\Services\Session\SsoSessionService;

final readonly class LogoutSsoSessionAction
{
    public function __construct(
        private SsoSessionService $sessions,
        private RecordLogoutAuditEventAction $audit,
    ) {}

    public function execute(?string $sessionId): LogoutSsoSessionResult
    {
        $session = $this->sessions->current($sessionId);

        if (! $session instanceof SsoSession) {
            $this->audit->execute('frontchannel_logout_completed', [
                'revoked' => false,
                'reason' => 'session_not_found',
            ]);

            return new LogoutSsoSessionResult(false, $sessionId, null);
        }

        $this->sessions->revoke($session);
        $this->audit->execute('frontchannel_logout_completed', [
            'revoked' => true,
            'sid' => $session->session_id,
            'sub' => (string) $session->user_id,
        ]);

        return new LogoutSsoSessionResult(true, $session->session_id, (string) $session->user_id);
    }
}

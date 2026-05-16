<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Actions\Audit\RecordLogoutAuditEventAction;
use App\Models\SsoSession;
use App\Services\Oidc\AccessTokenRevocationStore;
use App\Services\Oidc\BackChannelLogoutDispatcher;
use App\Services\Oidc\BackChannelSessionRegistry;
use App\Services\Oidc\LogicalSessionStore;
use App\Services\Oidc\RefreshTokenStore;
use App\Services\Session\SsoSessionService;

final readonly class LogoutSsoSessionAction
{
    public function __construct(
        private SsoSessionService $sessions,
        private RecordLogoutAuditEventAction $audit,
        private RefreshTokenStore $refreshTokens,
        private AccessTokenRevocationStore $revocations,
        private BackChannelSessionRegistry $registry,
        private BackChannelLogoutDispatcher $dispatcher,
        private LogicalSessionStore $logicalSessions,
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

        // BE-FR037-001: portal logout MUST fan out to every relying party
        // associated with this session — revoke their refresh tokens, the
        // tracked access-token JTIs, dispatch RP back-channel logout jobs,
        // and clear the registry so the session cannot survive a portal
        // sign-out via a still-valid downstream token.
        $resolvedSessionId = $session->session_id;
        $subjectId = $session->subject_id;

        $records = $this->refreshTokens->revokeSession($resolvedSessionId);
        $this->revocations->revokeSession($resolvedSessionId);

        $registrations = $this->registry->forSession($resolvedSessionId);
        $notifications = $this->dispatcher->dispatch($subjectId, $resolvedSessionId, $registrations);
        $this->registry->clear($resolvedSessionId);
        $this->logicalSessions->clear($subjectId, $resolvedSessionId);

        $this->audit->execute('frontchannel_logout_completed', [
            'revoked' => true,
            'sid' => $session->session_id,
            'sub' => (string) $session->user_id,
            'subject_id' => $subjectId,
            'refresh_tokens_revoked' => count($records),
            'rp_notifications' => count($notifications),
        ]);

        return new LogoutSsoSessionResult(true, $session->session_id, (string) $session->user_id);
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Services\Directory\DirectoryUser;
use App\Services\Directory\DirectoryUserProvider;
use App\Services\Session\SsoSessionService;

final readonly class LoginSsoUserAction
{
    public function __construct(
        private DirectoryUserProvider $directory,
        private SsoSessionService $sessions,
        private RecordAuthenticationAuditEventAction $audits,
    ) {}

    public function execute(string $identifier, string $password, ?string $ipAddress, ?string $userAgent): LoginSsoUserResult
    {
        $user = $this->directory->findByIdentifier($identifier);

        if ($user === null || ! $this->directory->validatePassword($user, $password)) {
            $this->recordFailure($identifier, $user, $ipAddress, $userAgent);

            return new LoginSsoUserResult(false, error: 'invalid_credentials');
        }

        $session = $this->sessions->create($user, $ipAddress, $userAgent);
        $this->recordSuccess($identifier, $user, $session->session_id, $ipAddress, $userAgent);

        return new LoginSsoUserResult(authenticated: true, user: $user, session: $session);
    }

    private function recordFailure(string $identifier, ?DirectoryUser $user, ?string $ipAddress, ?string $userAgent): void
    {
        $this->record('login_failed', 'failed', $identifier, $user, null, $ipAddress, $userAgent, 'invalid_credentials');
    }

    private function recordSuccess(string $identifier, DirectoryUser $user, string $sessionId, ?string $ipAddress, ?string $userAgent): void
    {
        $this->record('login_succeeded', 'succeeded', $identifier, $user, $sessionId, $ipAddress, $userAgent);
    }

    private function record(
        string $eventType,
        string $outcome,
        string $identifier,
        ?DirectoryUser $user,
        ?string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $errorCode = null,
    ): void {
        $this->audits->execute([
            'event_type' => $eventType,
            'outcome' => $outcome,
            'subject_id' => $user?->subjectId,
            'email' => $user?->email,
            'client_id' => null,
            'session_id' => $sessionId,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
            'error_code' => $errorCode,
            'request_id' => null,
            'context' => ['identifier_hash' => hash('sha256', mb_strtolower($identifier))],
            'occurred_at' => now(),
        ]);
    }
}

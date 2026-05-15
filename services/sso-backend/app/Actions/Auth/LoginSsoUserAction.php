<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Services\Directory\DirectoryUser;
use App\Services\Directory\DirectoryUserProvider;
use App\Services\Session\SsoSessionService;
use App\Support\Audit\AuthenticationAuditRecord;
use App\Support\Auth\LocalPasswordLoginOutcome;

final readonly class LoginSsoUserAction
{
    public function __construct(
        private DirectoryUserProvider $directory,
        private SsoSessionService $sessions,
        private RecordAuthenticationAuditEventAction $audits,
        private VerifyLocalPasswordLoginAction $verifier,
    ) {}

    public function execute(
        string $identifier,
        string $password,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $authRequestId = null,
        ?string $requestId = null,
    ): LoginSsoUserResult {
        $verification = $this->verifier->execute($identifier, $password);
        $directoryUser = $verification->user !== null
            ? $this->directory->findByIdentifier($verification->user->email)
            : null;

        if ($verification->outcome !== LocalPasswordLoginOutcome::Authenticated || $directoryUser === null) {
            $this->recordFailure($identifier, $directoryUser, $ipAddress, $userAgent, $authRequestId, $requestId, $verification->outcome->value);

            return new LoginSsoUserResult(false, error: $verification->outcome->value);
        }

        $session = $this->sessions->create($directoryUser, $ipAddress, $userAgent);
        $this->recordSuccess($identifier, $directoryUser, $session->session_id, $ipAddress, $userAgent, $authRequestId, $requestId);

        return new LoginSsoUserResult(authenticated: true, user: $directoryUser, session: $session);
    }

    private function recordFailure(
        string $identifier,
        ?DirectoryUser $user,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $authRequestId,
        ?string $requestId,
        string $errorCode,
    ): void {
        $this->audits->execute(AuthenticationAuditRecord::loginFailed(
            subjectId: $user?->subjectId,
            email: $user?->email,
            ipAddress: $ipAddress,
            userAgent: $userAgent,
            errorCode: $errorCode,
            requestId: $requestId,
            context: $this->loginContext($identifier, $authRequestId),
        ));
    }

    private function recordSuccess(
        string $identifier,
        DirectoryUser $user,
        string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $authRequestId,
        ?string $requestId,
    ): void {
        $this->audits->execute(AuthenticationAuditRecord::loginSucceeded(
            subjectId: $user->subjectId,
            email: $user->email,
            sessionId: $sessionId,
            ipAddress: $ipAddress,
            userAgent: $userAgent,
            requestId: $requestId,
            context: $this->loginContext($identifier, $authRequestId),
        ));
    }

    /**
     * @return array{identifier_hash: string, auth_request_id?: string}
     */
    private function loginContext(string $identifier, ?string $authRequestId): array
    {
        $context = ['identifier_hash' => hash('sha256', mb_strtolower($identifier))];

        if (is_string($authRequestId) && $authRequestId !== '') {
            $context['auth_request_id'] = $authRequestId;
        }

        return $context;
    }
}

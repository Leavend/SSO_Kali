<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Actions\Audit\RecordAuthenticationAuditEventAction;
use App\Services\Directory\DirectoryUser;
use App\Services\Directory\DirectoryUserProvider;
use App\Services\Session\SsoSessionService;
use App\Support\Audit\AuthenticationAuditRecord;

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
        $this->audits->execute(AuthenticationAuditRecord::loginFailed(
            subjectId: $user?->subjectId,
            email: $user?->email,
            ipAddress: $ipAddress,
            userAgent: $userAgent,
            errorCode: 'invalid_credentials',
            context: $this->identifierContext($identifier),
        ));
    }

    private function recordSuccess(string $identifier, DirectoryUser $user, string $sessionId, ?string $ipAddress, ?string $userAgent): void
    {
        $this->audits->execute(AuthenticationAuditRecord::loginSucceeded(
            subjectId: $user->subjectId,
            email: $user->email,
            sessionId: $sessionId,
            ipAddress: $ipAddress,
            userAgent: $userAgent,
            context: $this->identifierContext($identifier),
        ));
    }

    /**
     * @return array{identifier_hash: string}
     */
    private function identifierContext(string $identifier): array
    {
        return ['identifier_hash' => hash('sha256', mb_strtolower($identifier))];
    }
}

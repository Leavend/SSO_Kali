<?php

declare(strict_types=1);

namespace App\Support\Audit;

use Carbon\CarbonInterface;

final readonly class AuthenticationAuditRecord
{
    /**
     * @param  array<string, mixed>|null  $context
     */
    public function __construct(
        public string $eventType,
        public string $outcome,
        public ?string $subjectId,
        public ?string $email,
        public ?string $clientId,
        public ?string $sessionId,
        public ?string $ipAddress,
        public ?string $userAgent,
        public ?string $errorCode,
        public ?string $requestId,
        public ?array $context,
        public CarbonInterface $occurredAt,
    ) {}

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function loginSucceeded(
        string $subjectId,
        string $email,
        string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self('login_succeeded', 'succeeded', $subjectId, $email, null, $sessionId, $ipAddress, $userAgent, null, $requestId, $context, now());
    }

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function loginFailed(
        ?string $subjectId,
        ?string $email,
        ?string $ipAddress,
        ?string $userAgent,
        string $errorCode,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self('login_failed', 'failed', $subjectId, $email, null, null, $ipAddress, $userAgent, $errorCode, $requestId, $context, now());
    }

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function authorizationRequestAccepted(
        string $clientId,
        ?string $sessionId,
        ?string $subjectId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self('authorization_request_accepted', 'succeeded', $subjectId, null, $clientId, $sessionId, $ipAddress, $userAgent, null, $requestId, $context, now());
    }

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function authorizationRequestRejected(
        ?string $clientId,
        ?string $ipAddress,
        ?string $userAgent,
        string $errorCode,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self('authorization_request_rejected', 'failed', null, null, $clientId, null, $ipAddress, $userAgent, $errorCode, $requestId, $context, now());
    }

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function consentDecision(
        string $outcome,
        string $subjectId,
        string $clientId,
        ?string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $errorCode = null,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self('consent_decision', $outcome, $subjectId, null, $clientId, $sessionId, $ipAddress, $userAgent, $errorCode, $requestId, $context, now());
    }

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function tokenLifecycle(
        string $eventType,
        string $outcome,
        ?string $subjectId,
        ?string $clientId,
        ?string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $errorCode = null,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self($eventType, $outcome, $subjectId, null, $clientId, $sessionId, $ipAddress, $userAgent, $errorCode, $requestId, $context, now());
    }

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function logoutLifecycle(
        string $eventType,
        string $outcome,
        ?string $subjectId,
        ?string $clientId,
        ?string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $errorCode = null,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self($eventType, $outcome, $subjectId, null, $clientId, $sessionId, $ipAddress, $userAgent, $errorCode, $requestId, $context, now());
    }

    /**
     * @param  array<string, mixed>|null  $context
     */
    public static function externalIdpAuthentication(
        string $eventType,
        string $outcome,
        ?string $subjectId,
        ?string $email,
        ?string $clientId,
        ?string $sessionId,
        ?string $ipAddress,
        ?string $userAgent,
        ?string $errorCode = null,
        ?string $requestId = null,
        ?array $context = null,
    ): self {
        return new self($eventType, $outcome, $subjectId, $email, $clientId, $sessionId, $ipAddress, $userAgent, $errorCode, $requestId, $context, now());
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return [
            'event_type' => $this->eventType,
            'outcome' => $this->outcome,
            'subject_id' => $this->subjectId,
            'email' => $this->email,
            'client_id' => $this->clientId,
            'session_id' => $this->sessionId,
            'ip_address' => $this->ipAddress,
            'user_agent' => $this->userAgent,
            'error_code' => $this->errorCode,
            'request_id' => $this->requestId,
            'context' => $this->context,
            'occurred_at' => $this->occurredAt,
        ];
    }
}

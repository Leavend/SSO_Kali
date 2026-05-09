<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use App\Models\AuthenticationAuditEvent;
use App\Services\Audit\AuthenticationAuditEventStore;
use App\Services\Audit\AuthenticationAuditRedactor;
use App\Support\Audit\AuthenticationAuditRecord;

final readonly class RecordAuthenticationAuditEventAction
{
    public function __construct(
        private AuthenticationAuditEventStore $events,
        private AuthenticationAuditRedactor $redactor,
    ) {}

    public function execute(AuthenticationAuditRecord $record): AuthenticationAuditEvent
    {
        return $this->events->append($this->redacted($record));
    }

    private function redacted(AuthenticationAuditRecord $record): AuthenticationAuditRecord
    {
        return new AuthenticationAuditRecord(
            eventType: $record->eventType,
            outcome: $record->outcome,
            subjectId: $record->subjectId,
            email: $record->email,
            clientId: $record->clientId,
            sessionId: $record->sessionId,
            ipAddress: $record->ipAddress,
            userAgent: $record->userAgent,
            errorCode: $record->errorCode,
            requestId: $record->requestId,
            context: $this->context($record->context),
            occurredAt: $record->occurredAt,
        );
    }

    /**
     * @param  array<string, mixed>|null  $context
     * @return array<string, mixed>|null
     */
    private function context(?array $context): ?array
    {
        return $context === null ? null : $this->redactor->redact($context);
    }
}

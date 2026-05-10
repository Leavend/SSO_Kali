<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use App\Models\AuthenticationAuditEvent;
use App\Services\Audit\AuthenticationAuditEventStore;
use App\Services\Audit\AuthenticationAuditRedactor;
use App\Support\Audit\AuthenticationAuditRecord;
use Illuminate\Support\Facades\Log;
use Throwable;

final readonly class RecordAuthenticationAuditEventAction
{
    public function __construct(
        private AuthenticationAuditEventStore $events,
        private AuthenticationAuditRedactor $redactor,
    ) {}

    public function execute(AuthenticationAuditRecord $record): AuthenticationAuditEvent
    {
        $redacted = $this->redacted($record);

        try {
            $event = $this->events->append($redacted);
        } catch (Throwable $exception) {
            Log::warning('[SSO_AUTHENTICATION_AUDIT_PERSISTENCE_FAILED]', [
                'event_type' => $redacted->eventType,
                'outcome' => $redacted->outcome,
                'request_id' => $redacted->requestId,
                'client_id' => $redacted->clientId,
                'subject_id' => $redacted->subjectId,
                'error_code' => $redacted->errorCode,
                'reason' => $exception->getMessage(),
            ]);

            throw $exception;
        }

        Log::info('[SSO_AUTHENTICATION_AUDIT_PERSISTED]', [
            'event_id' => $event->event_id,
            'event_type' => $event->event_type,
            'outcome' => $event->outcome,
            'request_id' => $event->request_id,
            'client_id' => $event->client_id,
            'subject_id' => $event->subject_id,
            'error_code' => $event->error_code,
        ]);

        return $event;
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

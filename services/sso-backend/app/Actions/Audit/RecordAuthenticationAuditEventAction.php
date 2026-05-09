<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use App\Models\AuthenticationAuditEvent;
use App\Services\Audit\AuthenticationAuditEventStore;
use App\Services\Audit\AuthenticationAuditRedactor;

final readonly class RecordAuthenticationAuditEventAction
{
    public function __construct(
        private AuthenticationAuditEventStore $events,
        private AuthenticationAuditRedactor $redactor,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     */
    public function execute(array $payload): AuthenticationAuditEvent
    {
        return $this->events->append([
            ...$payload,
            'context' => $this->context($payload['context'] ?? []),
        ]);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function context(mixed $context): ?array
    {
        if (! is_array($context)) {
            return null;
        }

        return $this->redactor->redact($context);
    }
}

<?php

declare(strict_types=1);

namespace App\Services\Audit;

use App\Models\AuthenticationAuditEvent;
use App\Support\Audit\AuthenticationAuditRecord;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;

final class AuthenticationAuditEventStore
{
    public function append(AuthenticationAuditRecord $record): AuthenticationAuditEvent
    {
        return AuthenticationAuditEvent::query()->create($this->payload($record));
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(AuthenticationAuditRecord $record): array
    {
        return [
            ...$record->toPayload(),
            'event_id' => (string) Str::ulid(),
            'occurred_at' => $this->normalizedTimestamp($record->occurredAt),
            'created_at' => now(),
        ];
    }

    private function normalizedTimestamp(CarbonInterface $value): string
    {
        return $value->format('Y-m-d H:i:s');
    }
}

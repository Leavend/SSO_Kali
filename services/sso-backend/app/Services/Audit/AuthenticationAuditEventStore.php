<?php

declare(strict_types=1);

namespace App\Services\Audit;

use App\Models\AuthenticationAuditEvent;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;

final class AuthenticationAuditEventStore
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function append(array $payload): AuthenticationAuditEvent
    {
        return AuthenticationAuditEvent::query()->create($this->record($payload));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function record(array $payload): array
    {
        return [
            ...$payload,
            'event_id' => (string) Str::ulid(),
            'occurred_at' => $this->normalizedTimestamp($payload['occurred_at'] ?? now()),
            'created_at' => now(),
        ];
    }

    private function normalizedTimestamp(mixed $value): string
    {
        if ($value instanceof CarbonInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        return (string) $value;
    }
}

<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;

class AdminAuditEventStore
{
    /**
     * @param  array<string, mixed>  $payload
     */
    public function append(array $payload): void
    {
        $record = $this->record($payload, $this->latestHash());

        AdminAuditEvent::query()->create($record);
    }

    private function latestHash(): ?string
    {
        return AdminAuditEvent::query()->orderByDesc('id')->value('event_hash');
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function record(array $payload, ?string $previousHash): array
    {
        $record = [
            ...$payload,
            'event_id' => (string) Str::ulid(),
            'previous_hash' => $previousHash,
            'created_at' => now(),
        ];
        $record['occurred_at'] = $this->normalizedTimestamp($record['occurred_at'] ?? now());

        $record['event_hash'] = $this->hash($record);

        return $record;
    }

    /**
     * @param  array<string, mixed>  $record
     */
    public function hash(array $record): string
    {
        return hash_hmac('sha256', $this->canonicalPayload($record), $this->signingKey());
    }

    /**
     * @param  array<string, mixed>  $record
     */
    private function canonicalPayload(array $record): string
    {
        return json_encode([
            'event_id' => $record['event_id'],
            'action' => $record['action'],
            'outcome' => $record['outcome'],
            'taxonomy' => $record['taxonomy'],
            'admin_subject_id' => $record['admin_subject_id'],
            'admin_email' => $record['admin_email'],
            'admin_role' => $record['admin_role'],
            'method' => $record['method'],
            'path' => $record['path'],
            'ip_address' => $record['ip_address'],
            'reason' => $record['reason'],
            'context' => $record['context'],
            'occurred_at' => $this->normalizedTimestamp($record['occurred_at']),
            'previous_hash' => $record['previous_hash'],
        ], JSON_THROW_ON_ERROR);
    }

    private function normalizedTimestamp(mixed $value): string
    {
        if ($value instanceof CarbonInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        return (string) $value;
    }

    private function signingKey(): string
    {
        return (string) config('app.key', 'missing-app-key');
    }
}

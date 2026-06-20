<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\AdminAuditEvent;
use App\Support\Audit\AdminAuditSigningKeyRegistry;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;

class AdminAuditEventStore
{
    public function __construct(private readonly ?AdminAuditSigningKeyRegistry $registry = null) {}

    /**
     * @param  array<string, mixed>  $payload
     */
    public function append(array $payload): void
    {
        $registry = $this->registry();
        $record = $this->record($payload, $this->latestHash(), $registry->activeKeyId());

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
    private function record(array $payload, ?string $previousHash, string $signingKeyId): array
    {
        if (isset($payload['context'])) {
            $payload['context'] = $this->sanitizeUtf8($payload['context']);
        }
        if (isset($payload['reason']) && is_string($payload['reason'])) {
            $payload['reason'] = mb_convert_encoding($payload['reason'], 'UTF-8', 'UTF-8');
        }
        $correlation = $this->correlationColumns($payload['context'] ?? []);

        $record = [
            ...$payload,
            ...$correlation,
            'event_id' => (string) Str::ulid(),
            'previous_hash' => $previousHash,
            'signing_key_id' => $signingKeyId,
            'created_at' => now(),
        ];
        $record['occurred_at'] = $this->normalizedTimestamp($record['occurred_at'] ?? now());

        $record['event_hash'] = $this->hash($record, $signingKeyId);

        return $record;
    }

    /**
     * @param  array<string, mixed>  $record
     */
    public function hash(array $record, ?string $signingKeyId = null): string
    {
        $registry = $this->registry();
        $keyId = $signingKeyId ?? ($record['signing_key_id'] ?? null);
        $key = is_string($keyId) ? ($registry->keyForId($keyId) ?? $registry->activeKey()) : $registry->activeKey();

        return hash_hmac('sha256', $this->canonicalPayload($record), $key);
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
            'signing_key_id' => $record['signing_key_id'] ?? null,
        ], JSON_THROW_ON_ERROR);
    }

    private function normalizedTimestamp(mixed $value): string
    {
        if ($value instanceof CarbonInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        return (string) $value;
    }

    private function registry(): AdminAuditSigningKeyRegistry
    {
        return $this->registry ?? app(AdminAuditSigningKeyRegistry::class);
    }

    private function sanitizeUtf8(mixed $value): mixed
    {
        if (is_array($value)) {
            $sanitized = [];
            foreach ($value as $k => $v) {
                $k = is_string($k) ? mb_convert_encoding($k, 'UTF-8', 'UTF-8') : $k;
                $sanitized[$k] = $this->sanitizeUtf8($v);
            }

            return $sanitized;
        }

        if (is_string($value)) {
            return mb_convert_encoding($value, 'UTF-8', 'UTF-8');
        }

        return $value;
    }

    /**
     * @return array<string, string|null>
     */
    private function correlationColumns(mixed $context): array
    {
        $context = is_array($context) ? $context : [];
        $requestId = $this->stringValue($context, 'request_id');

        return [
            'request_id' => $requestId,
            'support_reference' => $this->stringValue($context, 'support_reference') ?? SupportReference::fromRequestId($requestId),
            'subject_id' => $this->stringValue($context, 'subject_id'),
            'target_subject_id' => $this->stringValue($context, 'target_subject_id'),
            'client_id' => $this->stringValue($context, 'client_id'),
            'session_id' => $this->stringValue($context, 'session_id'),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function stringValue(array $context, string $key): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }
}

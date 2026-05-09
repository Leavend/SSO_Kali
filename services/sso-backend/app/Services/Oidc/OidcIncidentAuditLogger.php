<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Services\Admin\AdminAuditEventStore;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class OidcIncidentAuditLogger
{
    private const TAXONOMY = 'oidc.security_incident';

    /**
     * @var list<string>
     */
    private const SECRET_KEYS = [
        'access_token',
        'assertion',
        'authorization',
        'client_secret',
        'code',
        'code_verifier',
        'id_token',
        'refresh_token',
        'token',
    ];

    public function __construct(
        private readonly AdminAuditEventStore $store,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     */
    public function record(string $action, Request $request, string $reason, array $context = []): void
    {
        $payload = $this->payload($action, $request, $reason, $context);

        $this->store->append([
            ...$payload,
            'outcome' => 'denied',
        ]);

        Log::warning('[OIDC_SECURITY_INCIDENT]', $this->logContext($payload));
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function payload(string $action, Request $request, string $reason, array $context): array
    {
        return [
            'action' => $action,
            'method' => $request->method(),
            'path' => $request->path(),
            'ip_address' => $request->ip(),
            'taxonomy' => self::TAXONOMY,
            'admin_email' => null,
            'admin_role' => null,
            'admin_subject_id' => null,
            'reason' => $reason,
            'context' => $this->context($request, $context),
            'occurred_at' => now(),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function context(Request $request, array $context): array
    {
        return [
            'incident_type' => 'oidc_protocol_violation',
            'client_id' => $this->clientId($request, $context),
            'request_id' => $request->headers->get('X-Request-Id') ?: (string) Str::ulid(),
            'user_agent' => $request->userAgent(),
            'input' => $this->redact($request->except(self::SECRET_KEYS)),
            ...$this->redact($context),
        ];
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function logContext(array $payload): array
    {
        return [
            'action' => $payload['action'],
            'reason' => $payload['reason'],
            'method' => $payload['method'],
            'path' => $payload['path'],
            'ip' => $payload['ip_address'],
            'taxonomy' => $payload['taxonomy'],
            'context' => $payload['context'],
            'timestamp' => $payload['occurred_at']->toIso8601String(),
        ];
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function clientId(Request $request, array $context): ?string
    {
        $clientId = $context['client_id'] ?? $request->input('client_id');

        return is_string($clientId) && $clientId !== '' ? $clientId : null;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function redact(array $context): array
    {
        return collect($context)
            ->mapWithKeys(fn (mixed $value, string $key): array => [$key => $this->redactedValue($key, $value)])
            ->all();
    }

    private function redactedValue(string $key, mixed $value): mixed
    {
        if (in_array(strtolower($key), self::SECRET_KEYS, true)) {
            return '[REDACTED]';
        }

        if (is_array($value)) {
            return $this->redact($value);
        }

        return $value;
    }
}

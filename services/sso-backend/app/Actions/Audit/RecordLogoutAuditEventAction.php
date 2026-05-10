<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use App\Support\Audit\AuthenticationAuditRecord;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

final class RecordLogoutAuditEventAction
{
    public function __construct(
        private readonly RecordAuthenticationAuditEventAction $authenticationAudits,
    ) {}

    /**
     * @param  array<string, mixed>  $context
     */
    public function execute(string $event, array $context = []): void
    {
        $payload = $this->payload($event, $context);

        Log::info('[SSO_LOGOUT_AUDIT]', $payload);

        try {
            $this->authenticationAudits->execute($this->authenticationAuditRecord($event, $payload));
        } catch (Throwable $exception) {
            Log::warning('[SSO_LOGOUT_AUDIT_PERSISTENCE_SKIPPED]', [
                'event' => $event,
                'reason' => $exception->getMessage(),
                'request_id' => $payload['request_id'],
            ]);
        }
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function payload(string $event, array $context): array
    {
        $safeContext = $this->safeContext($context);

        return [
            'event' => $event,
            'logout_channel' => $this->stringValue($safeContext, 'logout_channel'),
            'result' => $this->stringValue($safeContext, 'result'),
            'request_id' => $this->requestId($safeContext),
            'context' => $safeContext,
        ];
    }

    /**
     * @param  array{event: string, logout_channel: ?string, result: ?string, request_id: string, context: array<string, mixed>}  $payload
     */
    private function authenticationAuditRecord(string $event, array $payload): AuthenticationAuditRecord
    {
        $context = $payload['context'];
        $outcome = $this->outcome($event, $payload['result']);
        $errorCode = $outcome === 'failed'
            ? $this->stringValue($context, 'failure_class') ?? $this->stringValue($context, 'reason')
            : null;

        return AuthenticationAuditRecord::logoutLifecycle(
            eventType: $event,
            outcome: $outcome,
            subjectId: $this->stringValue($context, 'subject_id') ?? $this->stringValue($context, 'sub'),
            clientId: $this->stringValue($context, 'client_id'),
            sessionId: $this->stringValue($context, 'session_id') ?? $this->stringValue($context, 'sid'),
            ipAddress: request()->ip(),
            userAgent: request()->userAgent(),
            errorCode: $errorCode,
            requestId: $payload['request_id'],
            context: $this->authenticationAuditContext($context),
        );
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function authenticationAuditContext(array $context): array
    {
        return array_filter([
            'logout_channel' => $this->stringValue($context, 'logout_channel'),
            'result' => $this->stringValue($context, 'result'),
            'reason' => $this->stringValue($context, 'reason'),
            'failure_class' => $this->stringValue($context, 'failure_class'),
            'revoked' => $context['revoked'] ?? null,
            'notification_count' => $context['notification_count'] ?? null,
            'session_count' => $context['session_count'] ?? null,
            'post_logout_redirect_uri_hash' => $this->hashValue($context['post_logout_redirect_uri'] ?? null),
            'state_hash' => $this->hashValue($context['state'] ?? null),
        ], static fn (mixed $value): bool => $value !== null);
    }

    private function outcome(string $event, ?string $result): string
    {
        if ($result === 'failed' || str_ends_with($event, '_failed')) {
            return 'failed';
        }

        if ($result === 'started' || str_ends_with($event, '_started')) {
            return 'started';
        }

        return 'succeeded';
    }

    private function hashValue(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? hash('sha256', $value) : null;
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function safeContext(array $context): array
    {
        return $this->redactSensitiveValues($context);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    private function redactSensitiveValues(array $context): array
    {
        foreach ($context as $key => $value) {
            if ($this->isSensitiveKey((string) $key)) {
                unset($context[$key]);

                continue;
            }

            if (is_array($value)) {
                $context[$key] = $this->redactSensitiveValues($value);
            }
        }

        return $context;
    }

    private function isSensitiveKey(string $key): bool
    {
        return Str::contains(strtolower($key), [
            'authorization',
            'cookie',
            'password',
            'secret',
            'token',
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function stringValue(array $context, string $key): ?string
    {
        $value = $context[$key] ?? null;

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private function requestId(array $context): string
    {
        $contextRequestId = $this->stringValue($context, 'request_id');

        return $contextRequestId ?? request()->headers->get('X-Request-Id', 'n/a');
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

final class RecordLogoutAuditEventAction
{
    /**
     * @param  array<string, mixed>  $context
     */
    public function execute(string $event, array $context = []): void
    {
        Log::info('[SSO_LOGOUT_AUDIT]', $this->payload($event, $context));
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

<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use Illuminate\Support\Facades\Log;

final class RecordLogoutAuditEventAction
{
    /**
     * @param  array<string, mixed>  $context
     */
    public function execute(string $event, array $context = []): void
    {
        Log::info('[SSO_LOGOUT_AUDIT]', [
            'event' => $event,
            'context' => $this->safeContext($context),
        ]);
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
        return str_contains(strtolower($key), 'token')
            || str_contains(strtolower($key), 'secret')
            || str_contains(strtolower($key), 'password');
    }
}

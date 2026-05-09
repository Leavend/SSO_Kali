<?php

declare(strict_types=1);

namespace App\Support\Security;

use Throwable;

final class SensitiveAuditContextRedactor
{
    private const SENSITIVE_KEYS = [
        'access_token',
        'refresh_token',
        'id_token',
        'client_secret',
        'client_secret_encrypted',
        'code',
        'code_verifier',
        'password',
        'state',
        'token',
    ];

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function incidentContext(array $context, ?Throwable $exception = null): array
    {
        return $this->redact([
            ...$context,
            'exception_class' => $exception ? $exception::class : null,
            'exception_message' => $exception === null ? null : '[redacted]',
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function redact(array $context): array
    {
        return $this->redactArray($context);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function redactArray(array $payload): array
    {
        $redacted = [];

        foreach ($payload as $key => $value) {
            if ($this->isSensitive((string) $key)) {
                continue;
            }

            $redacted[$key] = is_array($value) ? $this->redactArray($value) : $value;
        }

        return $redacted;
    }

    private function isSensitive(string $key): bool
    {
        $normalized = strtolower($key);

        foreach (self::SENSITIVE_KEYS as $sensitive) {
            if ($normalized === $sensitive || str_ends_with($normalized, '_'.$sensitive)) {
                return true;
            }
        }

        return str_contains($normalized, 'secret') || str_contains($normalized, 'token');
    }
}

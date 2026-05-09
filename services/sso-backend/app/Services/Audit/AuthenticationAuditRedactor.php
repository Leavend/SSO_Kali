<?php

declare(strict_types=1);

namespace App\Services\Audit;

final class AuthenticationAuditRedactor
{
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
        'passcode',
        'password',
        'refresh_token',
        'token',
    ];

    /**
     * @param  array<string, mixed>  $context
     * @return array<string, mixed>
     */
    public function redact(array $context): array
    {
        return collect($context)
            ->mapWithKeys(fn (mixed $value, string $key): array => [$key => $this->redactedValue($key, $value)])
            ->all();
    }

    private function redactedValue(string $key, mixed $value): mixed
    {
        if ($this->isSecret($key)) {
            return '[REDACTED]';
        }

        if (is_array($value)) {
            return $this->redact($value);
        }

        return $value;
    }

    private function isSecret(string $key): bool
    {
        return in_array(strtolower($key), self::SECRET_KEYS, true);
    }
}

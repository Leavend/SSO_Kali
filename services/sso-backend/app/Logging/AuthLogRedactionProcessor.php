<?php

declare(strict_types=1);

namespace App\Logging;

use Monolog\LogRecord;

final class AuthLogRedactionProcessor
{
    private const array SENSITIVE_KEYS = [
        'password' => true,
        'passcode' => true,
        'secret' => true,
        'client_secret' => true,
        'code_verifier' => true,
        'refresh_token' => true,
        'access_token' => true,
        'id_token' => true,
        'authorization' => true,
    ];

    public function __invoke(LogRecord $record): LogRecord
    {
        return $record->with(
            message: $this->scrubString($record->message),
            context: $this->scrubArray($record->context),
            extra: $this->scrubArray($record->extra),
        );
    }

    /**
     * @param  array<mixed>  $values
     * @return array<mixed>
     */
    private function scrubArray(array $values): array
    {
        foreach ($values as $key => $value) {
            $values[$key] = $this->scrubValue($key, $value);
        }

        return $values;
    }

    private function scrubValue(int|string $key, mixed $value): mixed
    {
        if (is_string($key) && $this->isSensitiveKey($key)) {
            return '[REDACTED]';
        }

        if (is_array($value)) {
            return $this->scrubArray($value);
        }

        return is_string($value) ? $this->scrubString($value) : $value;
    }

    private function isSensitiveKey(string $key): bool
    {
        return isset(self::SENSITIVE_KEYS[strtolower($key)]);
    }

    private function scrubString(string $value): string
    {
        $value = preg_replace_callback(
            '/(password|client_secret|refresh_token|access_token|id_token)=([^&\\s]+)/i',
            static fn (array $matches): string => $matches[1].'=[REDACTED]',
            $value,
        ) ?? $value;

        return preg_replace_callback(
            '/"(password|client_secret)"\\s*:\\s*"[^"]+"/i',
            static fn (array $matches): string => '"'.$matches[1].'":"[REDACTED]"',
            $value,
        ) ?? $value;
    }
}

<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class InvalidOidcConfigurationException extends RuntimeException
{
    public static function missingConfig(string $key): self
    {
        return new self("OIDC configuration is missing required key: {$key}");
    }

    public static function invalidConfig(string $key, string $reason): self
    {
        return new self("OIDC configuration has invalid value for '{$key}': {$reason}");
    }

    public static function signingKeysNotLoaded(): self
    {
        return new self('OIDC signing keys could not be loaded. Please ensure keys are properly configured.');
    }
}

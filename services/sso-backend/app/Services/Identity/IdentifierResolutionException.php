<?php

declare(strict_types=1);

namespace App\Services\Identity;

use RuntimeException;

final class IdentifierResolutionException extends RuntimeException
{
    private function __construct(
        private readonly string $error,
        string $message,
    ) {
        parent::__construct($message);
    }

    public static function ambiguousIdentifier(): self
    {
        return new self('ambiguous_identifier', 'The identifier matches multiple active identities.');
    }

    public static function invalidCredentials(): self
    {
        return new self('invalid_credentials', 'The provided credentials could not be verified.');
    }

    public function error(): string
    {
        return $this->error;
    }
}

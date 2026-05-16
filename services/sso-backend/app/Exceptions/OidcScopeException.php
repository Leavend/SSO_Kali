<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Support\Oidc\SafeOidcErrorDescription;
use RuntimeException;
use Throwable;

/**
 * Domain-level scope policy violation.
 *
 * The exception MESSAGE is treated as a *technical* reason and MUST NOT be
 * propagated into OIDC `error_description`. Callers should use {@see safeDescription()}
 * to obtain a vetted public-facing string from the {@see SafeOidcErrorDescription}
 * catalog.
 */
final class OidcScopeException extends RuntimeException
{
    /**
     * @param  list<string>  $offendingScopes
     */
    public function __construct(
        string $reason,
        public readonly string $safeCode = 'invalid_scope',
        public readonly array $offendingScopes = [],
        ?Throwable $previous = null,
    ) {
        parent::__construct($reason, 0, $previous);
    }

    public function safeDescription(): string
    {
        return SafeOidcErrorDescription::safe($this->safeCode);
    }
}

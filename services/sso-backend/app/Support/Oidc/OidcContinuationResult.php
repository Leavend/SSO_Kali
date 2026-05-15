<?php

declare(strict_types=1);

namespace App\Support\Oidc;

/**
 * BE-FR023-001 — Result of a pending OIDC authorization continuation.
 */
final readonly class OidcContinuationResult
{
    public function __construct(
        public OidcContinuationOutcome $outcome,
        public ?string $redirectUri = null,
        public ?string $errorDescription = null,
    ) {}

    public static function authorizationCode(string $redirectUri): self
    {
        return new self(OidcContinuationOutcome::AuthorizationCode, $redirectUri);
    }

    public static function consent(string $redirectUri): self
    {
        return new self(OidcContinuationOutcome::Consent, $redirectUri);
    }

    public static function invalidContext(): self
    {
        return new self(OidcContinuationOutcome::InvalidContext);
    }

    public static function invalidClient(): self
    {
        return new self(OidcContinuationOutcome::InvalidClient);
    }

    public static function invalidScope(string $description): self
    {
        return new self(OidcContinuationOutcome::InvalidScope, errorDescription: $description);
    }

    public static function temporarilyUnavailable(): self
    {
        return new self(OidcContinuationOutcome::TemporarilyUnavailable);
    }
}

<?php

declare(strict_types=1);

namespace App\Services\Oidc;

/**
 * FR-019 / UC-19: ACR level evaluator for step-up authentication.
 *
 * Compares requested ACR values against the current session's ACR
 * to determine if step-up authentication is required.
 *
 * Hierarchy: null < urn:sso:loa:password < urn:sso:loa:mfa
 */
final class AcrEvaluator
{
    /** @var array<string, int> */
    private const array HIERARCHY = [
        'urn:sso:loa:password' => 10,
        'urn:sso:loa:mfa' => 20,
    ];

    /**
     * Check if the current ACR level satisfies the requested level.
     */
    public function satisfies(?string $current, string $requested): bool
    {
        $requestedLevel = $this->level($requested);

        // Unknown requested ACR → permissive (don't block)
        if ($requestedLevel === 0) {
            return true;
        }

        return $this->level($current) >= $requestedLevel;
    }

    /**
     * Get the numeric level for an ACR value.
     */
    public function level(?string $acr): int
    {
        if ($acr === null || $acr === '') {
            return 0;
        }

        return self::HIERARCHY[$acr] ?? 0;
    }
}

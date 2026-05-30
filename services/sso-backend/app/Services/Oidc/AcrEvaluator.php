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
     *
     * POLICY (Permissive for unknown ACR): Unknown requested ACR values
     * (those not in HIERARCHY) are treated as "no requirement" and return
     * true. This is a deliberate compat policy — RPs that request an
     * unrecognised assurance level receive the password-level flow rather
     * than an error. See FR-021 / NG-03 for the accepted policy decision.
     *
     * Rationale: strict rejection (per RFC OIDC Core §3.1.2.1) would break
     * RPs that send custom or future ACR values before the OP is updated to
     * recognise them. The advertised set is published via
     * acr_values_supported in the Discovery document so RPs can discover
     * supported values proactively.
     */
    public function satisfies(?string $current, string $requested): bool
    {
        $requestedLevel = $this->level($requested);

        // NG-03: permissive compat policy — unknown ACR → no requirement
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

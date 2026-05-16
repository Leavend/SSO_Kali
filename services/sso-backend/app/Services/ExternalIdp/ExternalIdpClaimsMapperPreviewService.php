<?php

declare(strict_types=1);

namespace App\Services\ExternalIdp;

use App\Models\ExternalIdentityProvider;
use RuntimeException;

/**
 * FR-058 / BE-FR058-001 — admin mapping preview projector.
 *
 * Wraps {@see ExternalIdpClaimsMapper} so the admin controller stays thin
 * and exposes a single typed shape that captures:
 *   - the mapped local identity (or null on failure),
 *   - declarative warnings for missing email/username,
 *   - the active missing-email policy resolved from `sso.external_idp.*`,
 *   - whether the projected identity would be safe to link under that
 *     policy.
 */
final class ExternalIdpClaimsMapperPreviewService
{
    public function __construct(private readonly ExternalIdpClaimsMapper $mapper) {}

    /**
     * @param  array<string, mixed>  $claims
     * @return array{mapped: array<string, mixed>|null, errors: list<string>, missing_email_strategy: string, safe_to_link: bool, warnings: list<string>}
     */
    public function preview(ExternalIdentityProvider $provider, array $claims): array
    {
        $strategy = $this->missingEmailStrategy();

        try {
            $mapped = $this->mapper->map($provider, $claims);
        } catch (RuntimeException $exception) {
            return [
                'mapped' => null,
                'errors' => [$exception->getMessage()],
                'missing_email_strategy' => $strategy,
                'safe_to_link' => false,
                'warnings' => [],
            ];
        }

        $missingEmail = $mapped['email'] === null;
        $safeToLink = ! $missingEmail || $strategy === 'subject_only';

        return [
            'mapped' => $mapped,
            'errors' => [],
            'missing_email_strategy' => $strategy,
            'safe_to_link' => $safeToLink,
            'warnings' => $this->warnings($mapped, $strategy),
        ];
    }

    /**
     * @param  array<string, mixed>  $mapped
     * @return list<string>
     */
    private function warnings(array $mapped, string $strategy): array
    {
        $warnings = [];

        if ($mapped['email'] === null) {
            $warnings[] = $strategy === 'subject_only'
                ? 'Email is missing; provider will link by (provider_key, subject).'
                : 'Email is missing; federation will be rejected by current strategy.';
        }

        if ($mapped['username'] === null && $mapped['email'] === null) {
            $warnings[] = 'Username fallback resolved to null; mapping should expose a stable identifier.';
        }

        return $warnings;
    }

    private function missingEmailStrategy(): string
    {
        $value = (string) config('sso.external_idp.missing_email_strategy', 'reject');

        return in_array($value, ['reject', 'subject_only'], true) ? $value : 'reject';
    }
}

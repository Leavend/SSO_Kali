<?php

declare(strict_types=1);

namespace App\Actions\Admin;

/**
 * BE-FR018-001 — Production policy guard for admin MFA enforcement.
 *
 * Returns a list of policy violations so the deploy pipeline (or boot-time
 * check) can fail fast when a production environment is misconfigured.
 *
 * Acceptance criteria enforced:
 *   - Production REQUIRES `sso.admin.mfa.enforced = true`.
 *   - Production REQUIRES `sso.admin.mfa.grace_period_hours = 0`.
 *   - Production REQUIRES at least one accepted AMR for the second factor.
 */
final class ValidateAdminMfaPolicyAction
{
    /**
     * @return array{valid: bool, environment: string, errors: list<string>, warnings: list<string>}
     */
    public function execute(): array
    {
        $environment = (string) config('app.env', 'production');
        $errors = [];
        $warnings = [];

        $enforced = (bool) config('sso.admin.mfa.enforced', false);
        $graceHours = (int) config('sso.admin.mfa.grace_period_hours', 0);
        $acceptedAmr = (array) config('sso.admin.mfa.accepted_amr', []);

        if ($environment === 'production') {
            if (! $enforced) {
                $errors[] = 'Admin MFA must be enforced in production (set ADMIN_PANEL_REQUIRE_MFA=true).';
            }

            if ($graceHours > 0) {
                $errors[] = "Admin MFA grace period must be 0 in production (current: {$graceHours} hours).";
            }

            if ($acceptedAmr === []) {
                $errors[] = 'Admin MFA accepted_amr list must not be empty in production.';
            }
        } else {
            if ($graceHours > 0 && ! $enforced) {
                $warnings[] = "Non-production grace period of {$graceHours} hours has no effect because MFA enforcement is disabled.";
            }
        }

        return [
            'valid' => $errors === [],
            'environment' => $environment,
            'errors' => array_values(array_unique($errors)),
            'warnings' => array_values(array_unique($warnings)),
        ];
    }
}

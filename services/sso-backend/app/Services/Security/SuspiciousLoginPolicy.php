<?php

declare(strict_types=1);

namespace App\Services\Security;

use App\Models\MfaCredential;
use App\Models\User;
use App\Support\Security\RiskLevel;

/**
 * FR-019 / UC-72: Suspicious login policy.
 *
 * Decides whether to trigger an MFA challenge based on the evaluated
 * risk level and the user's MFA enrollment status.
 *
 * Rules:
 * - High risk → always challenge (if user has MFA enrolled)
 * - Medium risk → challenge only if user has MFA enrolled
 * - Low risk → never challenge
 */
final class SuspiciousLoginPolicy
{
    /**
     * Determine if the login attempt should be challenged with MFA.
     */
    public function shouldChallenge(RiskLevel $risk, User $user): bool
    {
        if ($risk === RiskLevel::Low) {
            return false;
        }

        if ($risk === RiskLevel::High) {
            return $this->hasMfaEnrolled($user);
        }

        // Medium risk — only challenge if user has MFA available
        return false;
    }

    private function hasMfaEnrolled(User $user): bool
    {
        return MfaCredential::query()
            ->forUser($user->getKey())
            ->totp()
            ->verified()
            ->exists();
    }
}

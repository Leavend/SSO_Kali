<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Enums\SsoSessionLifecycleOutcome;
use App\Models\User;
use App\Repositories\UserRepository;
use App\Support\Oidc\SsoSessionLifecycleResult;

/**
 * FR-022 / UC-18, UC-20, UC-50, UC-55, UC-76: Stateless lifecycle guard
 * that re-validates the underlying user before an authorization code is
 * issued from an active SSO browser session.
 *
 * Keeps account-state enforcement consistent with
 * VerifyLocalPasswordLoginAction so admin disable/lock, local-account
 * suspension, password expiry, and MFA reset cannot be bypassed by an
 * already-authenticated browser session.
 */
final readonly class SsoSessionLifecycleGuard
{
    public function __construct(
        private UserRepository $users,
    ) {}

    public function evaluate(string $subjectId): SsoSessionLifecycleResult
    {
        if (trim($subjectId) === '') {
            return new SsoSessionLifecycleResult(SsoSessionLifecycleOutcome::UserNotFound);
        }

        $user = $this->users->findBySubjectId($subjectId);

        if (! $user instanceof User) {
            return new SsoSessionLifecycleResult(SsoSessionLifecycleOutcome::UserNotFound);
        }

        if ($user->disabled_at !== null) {
            return new SsoSessionLifecycleResult(SsoSessionLifecycleOutcome::Disabled, $user);
        }

        if ($user->local_account_enabled === false) {
            return new SsoSessionLifecycleResult(SsoSessionLifecycleOutcome::LocalAccountDisabled, $user);
        }

        if ($user->mfa_reset_required === true) {
            return new SsoSessionLifecycleResult(SsoSessionLifecycleOutcome::MfaResetRequired, $user);
        }

        if ($this->passwordExpired($user)) {
            return new SsoSessionLifecycleResult(SsoSessionLifecycleOutcome::PasswordExpired, $user);
        }

        return new SsoSessionLifecycleResult(SsoSessionLifecycleOutcome::Allowed, $user);
    }

    private function passwordExpired(User $user): bool
    {
        $maxAgeDays = (int) config('sso.auth.password_max_age_days', 90);

        if ($maxAgeDays <= 0) {
            return false;
        }

        if ($user->password_changed_at === null) {
            return false;
        }

        return $user->password_changed_at->diffInDays(now()) >= $maxAgeDays;
    }
}

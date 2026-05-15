<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Support\Auth\LocalPasswordLoginOutcome;
use App\Support\Auth\LocalPasswordLoginResult;
use Illuminate\Support\Facades\Hash;

/**
 * Shared stateless verifier for every local password login path.
 *
 * FR-014 / FR-016: Keeps lockout, disabled account, password expiry, and
 * credential checks consistent for /api/auth/login and /connect/local-login.
 */
final readonly class VerifyLocalPasswordLoginAction
{
    private const string DUMMY_HASH = '$2y$12$8Y64qMlfn7PZnDGeq4hO6.n65wk3j9jvd7vClJ.9x3iLpOLHqzQte';

    public function __construct(private LoginAttemptThrottle $throttle) {}

    public function execute(string $identifier, string $password): LocalPasswordLoginResult
    {
        $normalized = $this->normalize($identifier);

        if ($normalized === '' || $this->throttle->isThrottled($normalized)) {
            return new LocalPasswordLoginResult(
                outcome: LocalPasswordLoginOutcome::TooManyAttempts,
                remainingAttempts: $this->throttle->remainingAttempts($normalized),
                retryAfter: $this->throttle->availableIn($normalized),
            );
        }

        $user = $this->findUser($normalized);

        if (! $user instanceof User) {
            Hash::check($password, self::DUMMY_HASH);

            return $this->failed($normalized, LocalPasswordLoginOutcome::InvalidCredentials);
        }

        if ($user->disabled_at !== null || $user->local_account_enabled === false) {
            return $this->failed($normalized, LocalPasswordLoginOutcome::AccountLocked);
        }

        $storedHash = $user->getRawOriginal('password');

        if (! is_string($storedHash) || $storedHash === '' || ! password_verify($password, $storedHash)) {
            return $this->failed($normalized, LocalPasswordLoginOutcome::InvalidCredentials);
        }

        if (Hash::needsRehash($storedHash)) {
            $user->newQuery()->whereKey($user->getKey())->update(['password' => Hash::make($password)]);
        }

        if ($this->passwordExpired($user)) {
            return new LocalPasswordLoginResult(
                outcome: LocalPasswordLoginOutcome::PasswordExpired,
                user: $user,
                remainingAttempts: $this->throttle->remainingAttempts($normalized),
            );
        }

        $this->throttle->clear($normalized);

        return new LocalPasswordLoginResult(
            outcome: LocalPasswordLoginOutcome::Authenticated,
            user: $user,
            remainingAttempts: $this->throttle->remainingAttempts($normalized),
        );
    }

    private function failed(string $normalized, LocalPasswordLoginOutcome $outcome): LocalPasswordLoginResult
    {
        $this->throttle->recordFailure($normalized);

        return new LocalPasswordLoginResult(
            outcome: $outcome,
            remainingAttempts: $this->throttle->remainingAttempts($normalized),
        );
    }

    private function findUser(string $normalized): ?User
    {
        $user = User::query()
            ->where('email', $normalized)
            ->orWhere('subject_id', $normalized)
            ->first();

        return $user instanceof User ? $user : null;
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

    private function normalize(string $identifier): string
    {
        return mb_strtolower(trim($identifier));
    }
}

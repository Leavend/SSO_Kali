<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Services\Auth\LoginAttemptThrottle;
use App\Services\Identity\IdentifierResolutionException;
use App\Services\Identity\IdentifierResolver;
use App\Services\Identity\IdentifierType;
use App\Services\Identity\ResolvedIdentifier;
use App\Support\Auth\LocalPasswordLoginOutcome;
use App\Support\Auth\LocalPasswordLoginResult;
use App\Support\Identity\GovernmentIdentifier;
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
        $resolved = $this->resolveIdentifier($identifier);
        $normalized = $resolved?->loginHint() ?? $this->normalize($identifier);
        $user = $resolved instanceof ResolvedIdentifier ? $this->findUser($resolved) : null;

        if ($normalized === '' || $this->throttle->isThrottled($normalized)) {
            return new LocalPasswordLoginResult(
                outcome: LocalPasswordLoginOutcome::TooManyAttempts,
                user: $user,
                remainingAttempts: $this->throttle->remainingAttempts($normalized),
                retryAfter: $this->throttle->availableIn($normalized),
            );
        }

        if (! $user instanceof User) {
            $this->timingSafeProbe($password);

            return $this->failed($normalized, LocalPasswordLoginOutcome::InvalidCredentials, null);
        }

        if ($user->disabled_at !== null || $user->local_account_enabled === false) {
            return $this->failed($normalized, LocalPasswordLoginOutcome::AccountLocked, $user);
        }

        $storedHash = $user->getRawOriginal('password');

        if (! is_string($storedHash) || $storedHash === '' || ! password_verify($password, $storedHash)) {
            return $this->failed($normalized, LocalPasswordLoginOutcome::InvalidCredentials, $user);
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

    /**
     * Run a timing-safe probe so a missing-user lookup costs roughly the
     * same as a real verification. Uses the algorithm-agnostic
     * `password_verify()` so a strict driver mismatch cannot leak control
     * flow via an unhandled exception.
     */
    private function timingSafeProbe(string $password): void
    {
        password_verify($password, self::DUMMY_HASH);
    }

    private function failed(string $normalized, LocalPasswordLoginOutcome $outcome, ?User $user): LocalPasswordLoginResult
    {
        $this->throttle->recordFailure($normalized);

        return new LocalPasswordLoginResult(
            outcome: $outcome,
            user: $user,
            remainingAttempts: $this->throttle->remainingAttempts($normalized),
        );
    }

    private function findUser(ResolvedIdentifier $identifier): ?User
    {
        $query = User::query();
        $hash = null;

        match ($identifier->type) {
            IdentifierType::Email => $query->where('email', $identifier->normalized),
            IdentifierType::Username => $query->where('subject_id', $identifier->normalized),
            IdentifierType::Nip => $hash = GovernmentIdentifier::optionalNipHash($identifier->normalized),
            IdentifierType::Nisn => $hash = GovernmentIdentifier::optionalNisnHash($identifier->normalized),
            IdentifierType::Nik => $hash = GovernmentIdentifier::optionalNikHash($identifier->normalized),
        };

        if (in_array($identifier->type, [IdentifierType::Nik, IdentifierType::Nip, IdentifierType::Nisn], true)) {
            if ($hash === null) {
                return null;
            }

            $query->where($identifier->type->value.'_hash', $hash);
        }

        $users = $query->limit(2)->get();

        return $users->count() === 1 ? $users->first() : null;
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

    private function resolveIdentifier(string $identifier): ?ResolvedIdentifier
    {
        try {
            return app(IdentifierResolver::class)->parse($identifier);
        } catch (IdentifierResolutionException) {
            return null;
        }
    }
}

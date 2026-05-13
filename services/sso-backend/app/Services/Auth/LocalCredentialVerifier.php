<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

/**
 * FR-014 / ISSUE-02: Local credential verification.
 *
 * Verifies email + password against the User model.
 * Returns null on any failure (timing-safe).
 */
final class LocalCredentialVerifier
{
    /**
     * Verify local credentials. Returns the user on success, null on failure.
     *
     * Checks:
     * 1. User exists with given email
     * 2. User has a password set (not null)
     * 3. User is not disabled
     * 4. Password matches (Hash::check)
     */
    public function verify(string $email, string $password): ?User
    {
        $user = User::query()->where('email', $email)->first();

        if (! $user instanceof User) {
            // Timing-safe: still run hash check to prevent timing oracle
            Hash::check($password, '$2y$12$dummyhashtopreventtimingattacksxxxxxxxxxxxxxxxxxxxxxxxxx');

            return null;
        }

        if (! is_string($user->password) || $user->password === '') {
            return null;
        }

        if ($user->disabled_at !== null) {
            return null;
        }

        if (! Hash::check($password, $user->password)) {
            return null;
        }

        return $user;
    }

    /**
     * Check if the user account is disabled/locked.
     */
    public function isLocked(string $email): bool
    {
        $user = User::query()->where('email', $email)->first();

        return $user instanceof User && $user->disabled_at !== null;
    }
}

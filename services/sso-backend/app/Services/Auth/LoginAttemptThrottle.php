<?php

declare(strict_types=1);

namespace App\Services\Auth;

use Illuminate\Support\Facades\Cache;

/**
 * FR-014 / ISSUE-03: Login attempt throttle.
 *
 * Tracks failed login attempts per email using Redis.
 * After max attempts, the account is considered throttled.
 */
final class LoginAttemptThrottle
{
    private const string PREFIX = 'login_attempts:';

    /**
     * Record a failed login attempt.
     */
    public function recordFailure(string $email): int
    {
        $key = $this->key($email);
        $attempts = (int) Cache::get($key, 0) + 1;

        Cache::put($key, $attempts, $this->decaySeconds());

        return $attempts;
    }

    /**
     * Check if the email is currently throttled.
     */
    public function isThrottled(string $email): bool
    {
        return $this->attempts($email) >= $this->maxAttempts();
    }

    /**
     * Get remaining attempts before lockout.
     */
    public function remainingAttempts(string $email): int
    {
        return max(0, $this->maxAttempts() - $this->attempts($email));
    }

    /**
     * Get current attempt count.
     */
    public function attempts(string $email): int
    {
        return (int) Cache::get($this->key($email), 0);
    }

    /**
     * Clear attempts (e.g. after successful login).
     */
    public function clear(string $email): void
    {
        Cache::forget($this->key($email));
    }

    /**
     * Get seconds until throttle expires.
     */
    public function availableIn(string $email): int
    {
        if (! $this->isThrottled($email)) {
            return 0;
        }

        return $this->decaySeconds();
    }

    private function key(string $email): string
    {
        return self::PREFIX.hash('sha256', mb_strtolower($email));
    }

    private function maxAttempts(): int
    {
        return (int) config('sso.auth.max_login_attempts', 5);
    }

    private function decaySeconds(): int
    {
        return (int) config('sso.auth.login_lockout_seconds', 900);
    }
}

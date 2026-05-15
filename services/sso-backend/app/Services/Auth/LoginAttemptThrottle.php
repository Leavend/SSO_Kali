<?php

declare(strict_types=1);

namespace App\Services\Auth;

use Illuminate\Support\Facades\RateLimiter;

/**
 * FR-016: Atomic login attempt throttle.
 *
 * Uses Laravel RateLimiter so failed login counters are incremented atomically by
 * the configured cache backend and carry a clear lockout TTL.
 */
final class LoginAttemptThrottle
{
    private const string PREFIX = 'login_attempts:';

    /**
     * Record a failed login attempt atomically.
     */
    public function recordFailure(string $email): int
    {
        RateLimiter::hit($this->key($email), $this->decaySeconds());

        return $this->attempts($email);
    }

    /**
     * Check if the email is currently throttled.
     */
    public function isThrottled(string $email): bool
    {
        return RateLimiter::tooManyAttempts($this->key($email), $this->maxAttempts());
    }

    /**
     * Get remaining attempts before lockout.
     */
    public function remainingAttempts(string $email): int
    {
        return RateLimiter::remaining($this->key($email), $this->maxAttempts());
    }

    /**
     * Get current attempt count.
     */
    public function attempts(string $email): int
    {
        return RateLimiter::attempts($this->key($email));
    }

    /**
     * Clear attempts (e.g. after successful login).
     */
    public function clear(string $email): void
    {
        RateLimiter::clear($this->key($email));
    }

    /**
     * Get seconds until throttle expires.
     */
    public function availableIn(string $email): int
    {
        return RateLimiter::availableIn($this->key($email));
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

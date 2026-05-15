<?php

declare(strict_types=1);

use App\Services\Auth\LoginAttemptThrottle;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function (): void {
    config()->set('sso.auth.max_login_attempts', 3);
    config()->set('sso.auth.login_lockout_seconds', 900);
});

it('records failed login attempts with laravel atomic rate limiter', function (): void {
    RateLimiter::shouldReceive('hit')
        ->once()
        ->withArgs(fn (string $key, int $decaySeconds): bool => str_starts_with($key, 'login_attempts:') && $decaySeconds === 900)
        ->andReturn(1);

    RateLimiter::shouldReceive('attempts')
        ->once()
        ->withArgs(fn (string $key): bool => str_starts_with($key, 'login_attempts:'))
        ->andReturn(1);

    expect(app(LoginAttemptThrottle::class)->recordFailure('atomic@example.test'))->toBe(1);
});

it('uses configured lockout ttl for retry guidance', function (): void {
    $throttle = app(LoginAttemptThrottle::class);
    $throttle->clear('atomic@example.test');

    try {
        $throttle->recordFailure('atomic@example.test');
        $throttle->recordFailure('atomic@example.test');
        $throttle->recordFailure('atomic@example.test');

        expect($throttle->isThrottled('atomic@example.test'))->toBeTrue()
            ->and($throttle->remainingAttempts('atomic@example.test'))->toBe(0)
            ->and($throttle->availableIn('atomic@example.test'))->toBeGreaterThan(0)
            ->and($throttle->availableIn('atomic@example.test'))->toBeLessThanOrEqual(900);
    } finally {
        $throttle->clear('atomic@example.test');
    }
});

<?php

declare(strict_types=1);

use App\Actions\Mfa\VerifyMfaChallenge;
use App\Services\Mfa\MfaAttemptOutcome;
use App\Services\Mfa\MfaChallengeStore;
use Illuminate\Support\Facades\Cache;

/**
 * A challenge whose absolute expires_at has passed while the cache entry is
 * still present must surface an EXPIRY error, not the misleading
 * "Maximum verification attempts exceeded." lockout message.
 */
function expiredButCachedChallenge(string $id, int $userId = 1): void
{
    Cache::put('mfa_challenge:'.$id, [
        'user_id' => $userId,
        'attempts' => 0,
        'created_at' => now()->subMinutes(10)->toIso8601String(),
        'expires_at' => now()->subMinute()->toIso8601String(),
    ], 300);
}

it('throws an expiry message (not maximum-attempts) from the verify action', function (): void {
    $id = 'expired-verify-challenge';
    expiredButCachedChallenge($id);

    expect(fn () => app(VerifyMfaChallenge::class)->execute($id, 'totp', '000000'))
        ->toThrow(RuntimeException::class, 'Challenge expired or not found.');
});

it('reports the Expired outcome (not MaxAttemptsReached) when the absolute expiry has passed', function (): void {
    $id = 'expired-cached-challenge';
    expiredButCachedChallenge($id);

    expect(app(MfaChallengeStore::class)->incrementAttempt($id))->toBe(MfaAttemptOutcome::Expired)
        ->and(app(MfaChallengeStore::class)->find($id))->toBeNull();
});

it('reports the MaxAttemptsReached outcome distinctly from expiry', function (): void {
    $id = 'max-attempts-challenge';
    Cache::put('mfa_challenge:'.$id, [
        'user_id' => 1,
        'attempts' => 5,
        'created_at' => now()->toIso8601String(),
        'expires_at' => now()->addMinutes(5)->toIso8601String(),
    ], 300);

    expect(app(MfaChallengeStore::class)->incrementAttempt($id))->toBe(MfaAttemptOutcome::MaxAttemptsReached);
});

it('records a normal in-window attempt', function (): void {
    $created = app(MfaChallengeStore::class)->create(1);

    expect(app(MfaChallengeStore::class)->incrementAttempt($created['challenge_id']))->toBe(MfaAttemptOutcome::Recorded);
});

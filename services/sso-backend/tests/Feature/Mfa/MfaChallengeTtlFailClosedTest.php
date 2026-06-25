<?php

declare(strict_types=1);

use App\Services\Mfa\MfaAttemptOutcome;
use App\Services\Mfa\MfaChallengeStore;
use Illuminate\Support\Facades\Cache;

/**
 * A cached MFA challenge with no absolute `expires_at` (a pre-deploy/legacy
 * entry) must fail closed: a failed verify consumes it rather than resetting its
 * TTL to the full window, which would otherwise re-arm the OTP brute-force
 * window indefinitely.
 */
it('consumes a legacy challenge that lacks an absolute expires_at on a failed attempt', function (): void {
    $store = app(MfaChallengeStore::class);
    $challengeId = 'legacy-challenge-no-expiry';

    Cache::put('mfa_challenge:'.$challengeId, [
        'user_id' => 1,
        'attempts' => 0,
        'created_at' => now()->toIso8601String(),
    ], 300);

    expect($store->incrementAttempt($challengeId))->toBe(MfaAttemptOutcome::Expired)
        ->and($store->find($challengeId))->toBeNull();
});

it('keeps a normally-created challenge alive across a failed attempt', function (): void {
    $store = app(MfaChallengeStore::class);
    $created = $store->create(1);

    expect($store->incrementAttempt($created['challenge_id']))->toBe(MfaAttemptOutcome::Recorded)
        ->and($store->find($created['challenge_id']))->not->toBeNull();
});

<?php

declare(strict_types=1);

use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Security\SuspiciousLoginPolicy;
use App\Support\Security\RiskLevel;

it('triggers MFA challenge when risk score exceeds threshold', function (): void {
    $policy = app(SuspiciousLoginPolicy::class);
    $user = User::factory()->create();

    // User must have MFA enrolled for challenge to trigger
    MfaCredential::factory()->totp()->verified()->create([
        'user_id' => $user->getKey(),
    ]);

    $shouldChallenge = $policy->shouldChallenge(RiskLevel::High, $user);

    expect($shouldChallenge)->toBeTrue();
});

it('allows login without challenge when risk is low', function (): void {
    $policy = app(SuspiciousLoginPolicy::class);
    $user = User::factory()->create();

    $shouldChallenge = $policy->shouldChallenge(RiskLevel::Low, $user);

    expect($shouldChallenge)->toBeFalse();
});

it('does not challenge medium risk if user has no MFA enrolled', function (): void {
    $policy = app(SuspiciousLoginPolicy::class);
    $user = User::factory()->create();

    // Medium risk without MFA enrolled → don't challenge (no method available)
    $shouldChallenge = $policy->shouldChallenge(RiskLevel::Medium, $user);

    expect($shouldChallenge)->toBeFalse();
});

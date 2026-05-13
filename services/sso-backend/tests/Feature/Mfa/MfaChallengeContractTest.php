<?php

declare(strict_types=1);

use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Mfa\RecoveryCodeService;
use Illuminate\Support\Facades\Hash;
use OTPHP\TOTP;

it('returns mfa_required challenge when user with MFA logs in', function (): void {
    $user = User::factory()->create([
        'email' => 'mfa-challenge@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    MfaCredential::query()->create([
        'user_id' => $user->getKey(),
        'method' => 'totp',
        'secret' => 'JBSWY3DPEHPK3PXP',
        'verified_at' => now(),
    ]);

    $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk()
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('mfa_required', true)
        ->assertJsonStructure(['challenge' => ['challenge_id', 'methods_available', 'expires_at']]);
});

it('verifies MFA challenge with valid TOTP code and creates session', function (): void {
    $user = User::factory()->create([
        'email' => 'mfa-verify@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $secret = 'JBSWY3DPEHPK3PXP';

    MfaCredential::query()->create([
        'user_id' => $user->getKey(),
        'method' => 'totp',
        'secret' => $secret,
        'verified_at' => now(),
    ]);

    // Login to get challenge
    $loginResponse = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $challengeId = $loginResponse->json('challenge.challenge_id');

    // Generate valid TOTP code
    $code = TOTP::createFromSecret($secret)->now();

    $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challengeId,
        'method' => 'totp',
        'code' => $code,
    ])->assertOk()
        ->assertJsonPath('authenticated', true)
        ->assertJsonPath('mfa_method', 'totp')
        ->assertJsonStructure(['user' => ['subject_id', 'email'], 'session' => ['expires_at']]);
});

it('rejects MFA challenge with invalid TOTP code', function (): void {
    $user = User::factory()->create([
        'email' => 'mfa-reject@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    MfaCredential::query()->create([
        'user_id' => $user->getKey(),
        'method' => 'totp',
        'secret' => 'JBSWY3DPEHPK3PXP',
        'verified_at' => now(),
    ]);

    $loginResponse = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $challengeId = $loginResponse->json('challenge.challenge_id');

    $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challengeId,
        'method' => 'totp',
        'code' => '000000',
    ])->assertStatus(422)
        ->assertJsonPath('authenticated', false);
});

it('rejects expired or invalid challenge ID', function (): void {
    $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => 'non-existent-challenge-id',
        'method' => 'totp',
        'code' => '123456',
    ])->assertStatus(422)
        ->assertJsonPath('authenticated', false)
        ->assertJsonPath('error', 'Challenge expired or not found.');
});

it('verifies MFA challenge with recovery code', function (): void {
    $user = User::factory()->create([
        'email' => 'mfa-recovery@example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $secret = 'JBSWY3DPEHPK3PXP';

    MfaCredential::query()->create([
        'user_id' => $user->getKey(),
        'method' => 'totp',
        'secret' => $secret,
        'verified_at' => now(),
    ]);

    // Generate recovery codes
    $codes = app(RecoveryCodeService::class)->generate($user->getKey());

    // Login to get challenge
    $loginResponse = $this->postJson('/api/auth/login', [
        'identifier' => $user->email,
        'password' => 'correct-password',
    ])->assertOk();

    $challengeId = $loginResponse->json('challenge.challenge_id');

    // Use first recovery code
    $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challengeId,
        'method' => 'recovery_code',
        'code' => $codes[0],
    ])->assertOk()
        ->assertJsonPath('authenticated', true)
        ->assertJsonPath('mfa_method', 'recovery_code');
});

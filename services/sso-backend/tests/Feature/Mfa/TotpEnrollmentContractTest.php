<?php

declare(strict_types=1);

use App\Models\MfaCredential;
use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use OTPHP\TOTP;

it('starts TOTP enrollment and returns secret and provisioning URI', function (): void {
    [$user, $sessionId] = mfaEnrollmentSession('enroll-start');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->postJson('/api/mfa/totp/enroll')
        ->assertStatus(201)
        ->assertJsonStructure(['secret', 'provisioning_uri']);

    expect(MfaCredential::query()->where('user_id', $user->getKey())->whereNull('verified_at')->exists())->toBeTrue();
});

it('confirms TOTP enrollment with a valid code and returns recovery codes', function (): void {
    [$user, $sessionId] = mfaEnrollmentSession('enroll-confirm');

    $enrollResponse = $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->postJson('/api/mfa/totp/enroll')
        ->assertStatus(201);

    $secret = $enrollResponse->json('secret');

    // Generate a valid TOTP code
    $code = TOTP::createFromSecret($secret)->now();

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->postJson('/api/mfa/totp/verify', ['code' => $code])
        ->assertOk()
        ->assertJsonPath('verified', true)
        ->assertJsonStructure(['recovery_codes']);

    expect(MfaCredential::query()->where('user_id', $user->getKey())->whereNotNull('verified_at')->exists())->toBeTrue();
});

it('rejects invalid TOTP code during enrollment confirmation', function (): void {
    [, $sessionId] = mfaEnrollmentSession('enroll-invalid');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->postJson('/api/mfa/totp/enroll')
        ->assertStatus(201);

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->postJson('/api/mfa/totp/verify', ['code' => '000000'])
        ->assertStatus(422)
        ->assertJsonPath('verified', false);
});

it('returns MFA enrollment status for unenrolled user', function (): void {
    [, $sessionId] = mfaEnrollmentSession('enroll-status');

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->getJson('/api/mfa/status')
        ->assertOk()
        ->assertJsonPath('enrolled', false)
        ->assertJsonPath('methods', [])
        ->assertJsonPath('recovery_codes_remaining', 0);
});

it('removes TOTP credential with password confirmation', function (): void {
    [$user, $sessionId] = mfaEnrollmentSession('enroll-remove');

    // Directly create a verified credential
    MfaCredential::query()->create([
        'user_id' => $user->getKey(),
        'method' => 'totp',
        'secret' => 'JBSWY3DPEHPK3PXP',
        'verified_at' => now(),
    ]);

    $this->withHeader('Cookie', config('sso.session.cookie').'='.$sessionId)
        ->deleteJson('/api/mfa/totp', ['password' => 'correct-password'])
        ->assertOk()
        ->assertJsonPath('removed', true);

    expect(MfaCredential::query()->where('user_id', $user->getKey())->exists())->toBeFalse();
});

/**
 * Helper: create a user with an active SSO session.
 *
 * @return array{0: User, 1: string}
 */
function mfaEnrollmentSession(string $identifier): array
{
    $user = User::factory()->create([
        'email' => $identifier.'@mfa.example.test',
        'password' => Hash::make('correct-password'),
    ]);

    $sessionId = (string) Str::uuid();

    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHours(8),
    ]);

    return [$user, $sessionId];
}

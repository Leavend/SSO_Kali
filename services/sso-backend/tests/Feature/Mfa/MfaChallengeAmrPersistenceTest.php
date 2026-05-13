<?php

declare(strict_types=1);

use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Mfa\MfaChallengeStore;
use Illuminate\Support\Facades\DB;
use OTPHP\TOTP;

beforeEach(function (): void {
    $this->user = User::factory()->create();

    // Generate a real TOTP secret and create verified credential
    $this->totpSecret = TOTP::generate()->getSecret();

    MfaCredential::factory()->totp()->verified()->create([
        'user_id' => $this->user->getKey(),
        'secret' => $this->totpSecret,
    ]);
});

/** Generate a valid TOTP code from the test secret. */
function generateValidCode(string $secret): string
{
    $totp = TOTP::createFromSecret($secret);
    $totp->setDigits(6);
    $totp->setPeriod(30);

    return $totp->now();
}

it('persists amr [pwd, mfa] to login_contexts after successful MFA challenge', function (): void {
    /** @var MfaChallengeStore $store */
    $store = app(MfaChallengeStore::class);
    $challenge = $store->create($this->user->getKey());

    $response = $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challenge['challenge_id'],
        'method' => 'totp',
        'code' => generateValidCode($this->totpSecret),
    ]);

    $response->assertOk()
        ->assertJsonPath('authenticated', true);

    // Verify login_contexts was updated with MFA amr
    $this->assertDatabaseHas('login_contexts', [
        'subject_id' => $this->user->subject_id,
        'amr' => json_encode(['pwd', 'mfa']),
    ]);
});

it('sets acr to urn:sso:loa:mfa after successful MFA challenge', function (): void {
    /** @var MfaChallengeStore $store */
    $store = app(MfaChallengeStore::class);
    $challenge = $store->create($this->user->getKey());

    $response = $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challenge['challenge_id'],
        'method' => 'totp',
        'code' => generateValidCode($this->totpSecret),
    ]);

    $response->assertOk();

    $this->assertDatabaseHas('login_contexts', [
        'subject_id' => $this->user->subject_id,
        'acr' => 'urn:sso:loa:mfa',
    ]);
});

it('sets auth_time to current timestamp after MFA challenge', function (): void {
    /** @var MfaChallengeStore $store */
    $store = app(MfaChallengeStore::class);
    $challenge = $store->create($this->user->getKey());

    $now = now();
    $this->travelTo($now);

    $response = $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challenge['challenge_id'],
        'method' => 'totp',
        'code' => generateValidCode($this->totpSecret),
    ]);

    $response->assertOk();

    $context = DB::table('login_contexts')
        ->where('subject_id', $this->user->subject_id)
        ->latest('id')
        ->first();

    expect($context)->not->toBeNull();
    expect($context->auth_time)->not->toBeNull();
});

it('upgrades acr from urn:sso:loa:password to urn:sso:loa:mfa after challenge', function (): void {
    // Pre-create a login_contexts record with password-only ACR
    DB::table('login_contexts')->insert([
        'subject_id' => $this->user->subject_id,
        'ip_address' => '127.0.0.1',
        'amr' => json_encode(['pwd']),
        'acr' => 'urn:sso:loa:password',
        'auth_time' => now()->subMinutes(5),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    /** @var MfaChallengeStore $store */
    $store = app(MfaChallengeStore::class);
    $challenge = $store->create($this->user->getKey());

    $response = $this->postJson('/api/mfa/challenge/verify', [
        'challenge_id' => $challenge['challenge_id'],
        'method' => 'totp',
        'code' => generateValidCode($this->totpSecret),
    ]);

    $response->assertOk();

    // The latest login_contexts record should have upgraded ACR
    $context = DB::table('login_contexts')
        ->where('subject_id', $this->user->subject_id)
        ->latest('id')
        ->first();

    expect($context->acr)->toBe('urn:sso:loa:mfa');
    expect(json_decode($context->amr, true))->toContain('mfa');
});

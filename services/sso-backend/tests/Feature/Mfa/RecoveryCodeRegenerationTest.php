<?php

declare(strict_types=1);

namespace Tests\Feature\Mfa;

use App\Models\MfaCredential;
use App\Models\SsoSession;
use App\Models\User;
use App\Notifications\RecoveryCodesRegeneratedNotification;
use App\Services\Mfa\RecoveryCodeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    [$this->user, $this->sessionId] = createMfaTestSession('regen-test');
    $this->recoveryCodes = app(RecoveryCodeService::class);
});

describe('POST /api/mfa/recovery-codes/regenerate', function (): void {
    it('regenerates recovery codes with valid password', function (): void {
        Notification::fake();

        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $this->recoveryCodes->generate($this->user->getKey());

        $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
            ->postJson('/api/mfa/recovery-codes/regenerate', [
                'password' => 'password',
            ]);

        $response->assertOk();
        $response->assertJsonPath('regenerated', true);
        $response->assertJsonCount(8, 'recovery_codes');

        // Old codes should be invalidated, new 8 remain
        expect($this->recoveryCodes->remaining($this->user->getKey()))->toBe(8);

        Notification::assertSentTo($this->user, RecoveryCodesRegeneratedNotification::class);
    });

    it('rejects regeneration with invalid password', function (): void {
        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $this->recoveryCodes->generate($this->user->getKey());

        $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
            ->postJson('/api/mfa/recovery-codes/regenerate', [
                'password' => 'wrong-password',
            ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('regenerated', false);
        $response->assertJsonPath('message', 'Invalid password.');
    });

    it('rejects regeneration when no MFA is enrolled', function (): void {
        $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
            ->postJson('/api/mfa/recovery-codes/regenerate', [
                'password' => 'password',
            ]);

        $response->assertUnprocessable();
        $response->assertJsonPath('message', 'No verified MFA credential found.');
    });

    it('requires password field', function (): void {
        $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
            ->postJson('/api/mfa/recovery-codes/regenerate', []);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors(['password']);
    });

    it('requires authentication', function (): void {
        $response = $this->postJson('/api/mfa/recovery-codes/regenerate', [
            'password' => 'password',
        ]);

        $response->assertUnauthorized();
    });

    it('does not send notification when feature flag is disabled', function (): void {
        Notification::fake();
        config()->set('security-notifications.enabled', false);

        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $this->recoveryCodes->generate($this->user->getKey());

        $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
            ->postJson('/api/mfa/recovery-codes/regenerate', [
                'password' => 'password',
            ]);

        $response->assertOk();
        Notification::assertNotSentTo($this->user, RecoveryCodesRegeneratedNotification::class);
    });
});

/**
 * Helper: create a user with an active SSO session for testing.
 *
 * @return array{0: User, 1: string}
 */
function createMfaTestSession(string $identifier): array
{
    $user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $identifier.'@mfa.example.test',
        'password' => Hash::make('password'),
        'display_name' => 'MFA Test User',
        'given_name' => 'MFA',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
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
        'expires_at' => now()->addMinutes(60),
    ]);

    return [$user, $sessionId];
}

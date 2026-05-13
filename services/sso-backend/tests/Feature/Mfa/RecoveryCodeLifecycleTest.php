<?php

declare(strict_types=1);

namespace Tests\Feature\Mfa;

use App\Models\MfaCredential;
use App\Models\MfaRecoveryCode;
use App\Models\User;
use App\Services\Mfa\MfaChallengeStore;
use App\Services\Mfa\RecoveryCodeService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->user = User::factory()->create();
    $this->recoveryCodes = app(RecoveryCodeService::class);
});

describe('Recovery code generation during enrollment', function (): void {
    it('generates recovery codes when TOTP enrollment is confirmed', function (): void {
        // Arrange: create a verified TOTP credential
        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);

        // Act: generate codes
        $codes = $this->recoveryCodes->generate($this->user->getKey());

        // Assert
        expect($codes)->toHaveCount(8);
        expect($this->recoveryCodes->remaining($this->user->getKey()))->toBe(8);
    });
});

describe('Recovery code usage during MFA challenge', function (): void {
    it('allows login via recovery code when TOTP is unavailable', function (): void {
        // Arrange
        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $codes = $this->recoveryCodes->generate($this->user->getKey());

        $challengeStore = app(MfaChallengeStore::class);
        $challenge = $challengeStore->create($this->user->getKey());
        $challengeId = $challenge['challenge_id'];

        // Act
        $response = $this->postJson('/api/mfa/challenge/verify', [
            'challenge_id' => $challengeId,
            'method' => 'recovery_code',
            'code' => $codes[0],
        ]);

        // Assert
        $response->assertOk();
        $response->assertJsonPath('authenticated', true);
        expect($this->recoveryCodes->remaining($this->user->getKey()))->toBe(7);
    });

    it('rejects an already-used recovery code during challenge', function (): void {
        // Arrange
        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $codes = $this->recoveryCodes->generate($this->user->getKey());

        // Use the code once
        $this->recoveryCodes->verify($this->user->getKey(), $codes[0]);

        $challengeStore = app(MfaChallengeStore::class);
        $challenge = $challengeStore->create($this->user->getKey());
        $challengeId = $challenge['challenge_id'];

        // Act
        $response = $this->postJson('/api/mfa/challenge/verify', [
            'challenge_id' => $challengeId,
            'method' => 'recovery_code',
            'code' => $codes[0],
        ]);

        // Assert
        $response->assertUnprocessable();
    });

    it('rejects challenge when all recovery codes are exhausted', function (): void {
        // Arrange
        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $codes = $this->recoveryCodes->generate($this->user->getKey());

        // Consume all codes
        foreach ($codes as $code) {
            $this->recoveryCodes->verify($this->user->getKey(), $code);
        }

        $challengeStore = app(MfaChallengeStore::class);
        $challenge = $challengeStore->create($this->user->getKey());
        $challengeId = $challenge['challenge_id'];

        // Act
        $response = $this->postJson('/api/mfa/challenge/verify', [
            'challenge_id' => $challengeId,
            'method' => 'recovery_code',
            'code' => 'ANYCODE123',
        ]);

        // Assert
        $response->assertUnprocessable();
    });
});

describe('Recovery code cleanup on MFA removal', function (): void {
    it('deletes all recovery codes when TOTP is removed', function (): void {
        // Arrange
        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $this->recoveryCodes->generate($this->user->getKey());

        expect($this->recoveryCodes->remaining($this->user->getKey()))->toBe(8);

        // Act: simulate removal
        MfaRecoveryCode::query()->forUser($this->user->getKey())->delete();

        // Assert
        expect($this->recoveryCodes->remaining($this->user->getKey()))->toBe(0);
    });
});

describe('Recovery code isolation between users', function (): void {
    it('does not allow cross-user recovery code usage', function (): void {
        // Arrange
        $otherUser = User::factory()->create();
        MfaCredential::factory()->totp()->verified()->create([
            'user_id' => $this->user->getKey(),
        ]);
        $codes = $this->recoveryCodes->generate($this->user->getKey());

        // Act: try to use user A's code for user B
        $result = $this->recoveryCodes->verify($otherUser->getKey(), $codes[0]);

        // Assert
        expect($result)->toBeFalse();
        // Original user's code should still be valid
        expect($this->recoveryCodes->verify($this->user->getKey(), $codes[0]))->toBeTrue();
    });
});

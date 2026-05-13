<?php

declare(strict_types=1);

namespace App\Actions\Mfa;

use App\Models\MfaCredential;
use App\Models\User;
use App\Notifications\LowRecoveryCodesNotification;
use App\Notifications\RecoveryCodeUsedNotification;
use App\Services\Mfa\MfaChallengeStore;
use App\Services\Mfa\RecoveryCodeService;
use App\Services\Mfa\TotpService;
use RuntimeException;

/**
 * FR-018 / UC-67: Verify MFA challenge during login.
 *
 * Validates TOTP code or recovery code against the user's credential.
 * On success, consumes the challenge and returns the verified user.
 */
final class VerifyMfaChallenge
{
    public function __construct(
        private readonly TotpService $totp,
        private readonly RecoveryCodeService $recoveryCodes,
        private readonly MfaChallengeStore $challenges,
    ) {}

    /**
     * @return array{authenticated: true, method: string}
     *
     * @throws RuntimeException
     */
    public function execute(string $challengeId, string $method, string $code): array
    {
        $challenge = $this->challenges->find($challengeId);

        if ($challenge === null) {
            throw new RuntimeException('Challenge expired or not found.');
        }

        if (! $this->challenges->incrementAttempt($challengeId)) {
            throw new RuntimeException('Maximum verification attempts exceeded.');
        }

        $userId = (int) $challenge['user_id'];

        $verified = match ($method) {
            'totp' => $this->verifyTotp($userId, $code),
            'recovery_code' => $this->recoveryCodes->verify($userId, $code),
            default => throw new RuntimeException('Unsupported MFA method.'),
        };

        if (! $verified) {
            throw new RuntimeException('Invalid verification code.');
        }

        $this->challenges->consume($challengeId);
        $this->touchCredential($userId);

        if ($method === 'recovery_code') {
            $this->notifyRecoveryCodeUsed($userId);
        }

        return [
            'authenticated' => true,
            'method' => $method,
        ];
    }

    public function userIdFromChallenge(string $challengeId): ?int
    {
        $challenge = $this->challenges->find($challengeId);

        return $challenge !== null ? (int) $challenge['user_id'] : null;
    }

    private function verifyTotp(int $userId, string $code): bool
    {
        $credential = MfaCredential::query()
            ->forUser($userId)
            ->totp()
            ->verified()
            ->first();

        if (! $credential instanceof MfaCredential) {
            return false;
        }

        return $this->totp->verify($credential->secret, $code);
    }

    private function touchCredential(int $userId): void
    {
        MfaCredential::query()
            ->forUser($userId)
            ->totp()
            ->verified()
            ->update(['last_used_at' => now()]);
    }

    private function notifyRecoveryCodeUsed(int $userId): void
    {
        if (! config('security-notifications.enabled', true)) {
            return;
        }

        $user = User::query()->find($userId);

        if (! $user instanceof User) {
            return;
        }

        $remaining = $this->recoveryCodes->remaining($userId);
        $threshold = (int) config('security-notifications.low_recovery_codes_threshold', 2);

        $user->notify(new RecoveryCodeUsedNotification($remaining));

        if ($remaining <= $threshold) {
            $user->notify(new LowRecoveryCodesNotification($remaining));
        }
    }
}

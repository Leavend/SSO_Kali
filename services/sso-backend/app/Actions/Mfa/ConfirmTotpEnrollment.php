<?php

declare(strict_types=1);

namespace App\Actions\Mfa;

use App\Models\MfaCredential;
use App\Models\User;
use App\Notifications\MfaEnabledNotification;
use App\Services\Mfa\RecoveryCodeService;
use App\Services\Mfa\TotpService;
use RuntimeException;

/**
 * FR-018 / UC-66: Confirm TOTP enrollment.
 *
 * Validates the user's 6-digit code against the pending credential,
 * marks it as verified, and generates recovery codes.
 */
final class ConfirmTotpEnrollment
{
    public function __construct(
        private readonly TotpService $totp,
        private readonly RecoveryCodeService $recoveryCodes,
    ) {}

    /**
     * @return array{verified: true, recovery_codes: list<string>}
     *
     * @throws RuntimeException
     */
    public function execute(User $user, string $code): array
    {
        $credential = MfaCredential::query()
            ->forUser($user->getKey())
            ->totp()
            ->whereNull('verified_at')
            ->first();

        if (! $credential instanceof MfaCredential) {
            throw new RuntimeException('No pending TOTP enrollment found.');
        }

        // Enrollment must be confirmed within 10 minutes
        if ($credential->created_at->diffInMinutes(now()) > 10) {
            $credential->delete();

            throw new RuntimeException('TOTP enrollment expired. Please start again.');
        }

        if (! $this->totp->verify($credential->secret, $code)) {
            throw new RuntimeException('Invalid TOTP code.');
        }

        $credential->update(['verified_at' => now()]);

        $codes = $this->recoveryCodes->generate($user->getKey());

        if (config('security-notifications.enabled', true)) {
            $user->notify(new MfaEnabledNotification('totp'));
        }

        return [
            'verified' => true,
            'recovery_codes' => $codes,
        ];
    }
}

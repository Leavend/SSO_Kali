<?php

declare(strict_types=1);

namespace App\Actions\Mfa;

use App\Models\MfaCredential;
use App\Models\User;
use App\Notifications\RecoveryCodesRegeneratedNotification;
use App\Services\Mfa\RecoveryCodeService;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/**
 * FR-020 / UC-69: Regenerate recovery codes.
 *
 * Requires password re-authentication. Invalidates all existing codes
 * and generates a fresh set of 8 codes.
 */
final class RegenerateRecoveryCodes
{
    public function __construct(
        private readonly RecoveryCodeService $recoveryCodes,
    ) {}

    /**
     * @return list<string> Plain-text codes (shown once to user)
     *
     * @throws RuntimeException
     */
    public function execute(User $user, string $password): array
    {
        if (! Hash::check($password, $user->password)) {
            throw new RuntimeException('Invalid password.');
        }

        $credential = MfaCredential::query()
            ->forUser($user->getKey())
            ->totp()
            ->verified()
            ->first();

        if (! $credential instanceof MfaCredential) {
            throw new RuntimeException('No verified MFA credential found.');
        }

        $codes = $this->recoveryCodes->generate($user->getKey());

        if (config('security-notifications.enabled', true)) {
            $user->notify(new RecoveryCodesRegeneratedNotification);
        }

        return $codes;
    }
}

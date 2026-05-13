<?php

declare(strict_types=1);

namespace App\Actions\Mfa;

use App\Models\MfaCredential;
use App\Models\MfaRecoveryCode;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

/**
 * FR-018 / UC-66: Remove TOTP credential.
 *
 * Requires password confirmation before deletion.
 * Removes both the credential and all recovery codes.
 */
final class RemoveTotpCredential
{
    /**
     * @throws RuntimeException
     */
    public function execute(User $user, string $password): void
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
            throw new RuntimeException('No verified TOTP credential found.');
        }

        MfaRecoveryCode::query()->forUser($user->getKey())->delete();
        $credential->delete();
    }
}

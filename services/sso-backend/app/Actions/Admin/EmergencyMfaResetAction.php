<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\MfaCredential;
use App\Models\MfaRecoveryCode;
use App\Models\User;
use App\Notifications\MfaDisabledNotification;
use RuntimeException;

/**
 * FR-020 / UC-76: Emergency MFA reset by admin.
 *
 * Force-removes TOTP credential and all recovery codes for a target user.
 * Used when user has lost device + all recovery codes.
 */
final class EmergencyMfaResetAction
{
    /**
     * @throws RuntimeException
     */
    public function execute(User $targetUser): void
    {
        $credential = MfaCredential::query()
            ->forUser($targetUser->getKey())
            ->totp()
            ->verified()
            ->first();

        if (! $credential instanceof MfaCredential) {
            throw new RuntimeException('User does not have MFA enrolled.');
        }

        MfaRecoveryCode::query()->forUser($targetUser->getKey())->delete();
        $credential->delete();

        if (config('security-notifications.enabled', true)) {
            $targetUser->notify(new MfaDisabledNotification(byAdmin: true));
        }
    }
}

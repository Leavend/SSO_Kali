<?php

declare(strict_types=1);

namespace App\Actions\Mfa;

use App\Models\MfaCredential;
use App\Models\User;
use App\Services\Mfa\TotpService;

/**
 * FR-018 / UC-66: Start TOTP enrollment.
 *
 * Creates an unverified MFA credential with a generated secret.
 * Returns the secret and provisioning URI for QR code display.
 */
final class StartTotpEnrollment
{
    public function __construct(
        private readonly TotpService $totp,
    ) {}

    /**
     * @return array{secret: string, provisioning_uri: string}
     */
    public function execute(User $user): array
    {
        // Remove any pending (unverified) enrollment
        MfaCredential::query()
            ->forUser($user->getKey())
            ->totp()
            ->whereNull('verified_at')
            ->delete();

        $secret = $this->totp->generateSecret();

        MfaCredential::query()->create([
            'user_id' => $user->getKey(),
            'method' => 'totp',
            'secret' => $secret,
            'algorithm' => 'sha1',
            'digits' => (int) config('sso.mfa.totp.digits', 6),
            'period' => (int) config('sso.mfa.totp.period', 30),
        ]);

        return [
            'secret' => $secret,
            'provisioning_uri' => $this->totp->provisioningUri($secret, $user->email),
        ];
    }
}

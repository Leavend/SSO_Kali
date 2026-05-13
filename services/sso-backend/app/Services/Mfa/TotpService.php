<?php

declare(strict_types=1);

namespace App\Services\Mfa;

use OTPHP\TOTP;

/**
 * FR-018: TOTP service wrapping spomky-labs/otphp.
 *
 * Handles secret generation, provisioning URI creation,
 * and code verification with ±1 window tolerance.
 */
final class TotpService
{
    /**
     * Generate a new TOTP secret.
     */
    public function generateSecret(): string
    {
        $totp = TOTP::generate();

        return $totp->getSecret();
    }

    /**
     * Generate the provisioning URI for authenticator apps.
     */
    public function provisioningUri(string $secret, string $userEmail): string
    {
        $totp = $this->buildTotp($secret);
        $totp->setLabel($userEmail);
        $totp->setIssuer($this->issuer());

        return $totp->getProvisioningUri();
    }

    /**
     * Verify a TOTP code against the secret.
     *
     * Uses a window of 1 (accepts codes from ±1 period).
     */
    public function verify(string $secret, string $code): bool
    {
        $totp = $this->buildTotp($secret);

        return $totp->verify($code, null, 1);
    }

    private function buildTotp(string $secret): TOTP
    {
        $totp = TOTP::createFromSecret($secret);
        $totp->setDigits((int) config('sso.mfa.totp.digits', 6));
        $totp->setPeriod((int) config('sso.mfa.totp.period', 30));

        return $totp;
    }

    private function issuer(): string
    {
        return (string) config('sso.mfa.totp.issuer', config('app.name', 'SSO'));
    }
}

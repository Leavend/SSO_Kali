<?php

declare(strict_types=1);

namespace App\Support\Security;

use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

final class ClientSecretIssuer
{
    public function __construct(
        private readonly ClientSecretHashPolicy $hashes,
    ) {}

    public function issue(): IssuedClientSecret
    {
        $plaintext = Str::random($this->plaintextLength());
        $issuedAt = Carbon::now();

        return new IssuedClientSecret(
            plaintext: $plaintext,
            hash: $this->hashes->make($plaintext),
            issuedAt: $issuedAt,
            expiresAt: $issuedAt->copy()->addDays($this->ttlDays()),
        );
    }

    private function plaintextLength(): int
    {
        $length = (int) config('sso.client_secret.plaintext_length', 64);

        return $length >= 32 ? $length : 64;
    }

    private function ttlDays(): int
    {
        $days = (int) config('sso.client_secret.ttl_days', 90);

        return $days > 0 ? $days : 90;
    }
}

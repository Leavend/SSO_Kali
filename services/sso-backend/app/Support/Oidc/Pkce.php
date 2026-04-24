<?php

declare(strict_types=1);

namespace App\Support\Oidc;

use App\Support\Crypto\Base64Url;

final class Pkce
{
    public static function generateVerifier(): string
    {
        return Base64Url::encode(random_bytes(64));
    }

    public static function challengeFrom(string $verifier): string
    {
        return Base64Url::encode(hash('sha256', $verifier, true));
    }

    public static function matches(string $verifier, string $challenge): bool
    {
        return hash_equals(self::challengeFrom($verifier), $challenge);
    }
}

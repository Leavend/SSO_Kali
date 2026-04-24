<?php

declare(strict_types=1);

namespace App\Support\Crypto;

final class Base64Url
{
    public static function encode(string $value): string
    {
        $encoded = base64_encode($value);

        return rtrim(strtr($encoded, '+/', '-_'), '=');
    }

    public static function decode(string $value): string
    {
        $padding = strlen($value) % 4;
        $normalized = strtr($value, '-_', '+/');
        $normalized .= $padding === 0 ? '' : str_repeat('=', 4 - $padding);
        $decoded = base64_decode($normalized, true);

        if (! is_string($decoded)) {
            throw new \RuntimeException('Invalid base64url payload.');
        }

        return $decoded;
    }
}

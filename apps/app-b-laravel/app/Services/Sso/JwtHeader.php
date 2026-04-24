<?php

declare(strict_types=1);

namespace App\Services\Sso;

use RuntimeException;

final class JwtHeader
{
    public static function algorithm(string $token): string
    {
        $algorithm = self::parse($token)['alg'] ?? null;

        if (! is_string($algorithm) || $algorithm === '') {
            throw new RuntimeException('JWT alg header is invalid.');
        }

        return $algorithm;
    }

    public static function keyId(string $token): ?string
    {
        $keyId = self::parse($token)['kid'] ?? null;

        return is_string($keyId) && $keyId !== '' ? $keyId : null;
    }

    /**
     * @return array<string, mixed>
     */
    private static function parse(string $token): array
    {
        $segments = explode('.', $token, 3);
        $header = $segments[0];
        $json = self::decode($header);
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($decoded)) {
            throw new RuntimeException('JWT header is invalid.');
        }

        return $decoded;
    }

    private static function decode(string $value): string
    {
        $padding = strlen($value) % 4;
        $normalized = strtr($value, '-_', '+/');
        $normalized .= $padding === 0 ? '' : str_repeat('=', 4 - $padding);
        $decoded = base64_decode($normalized, true);

        if (! is_string($decoded)) {
            throw new RuntimeException('JWT header encoding is invalid.');
        }

        return $decoded;
    }
}

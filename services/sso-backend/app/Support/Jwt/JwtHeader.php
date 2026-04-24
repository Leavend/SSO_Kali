<?php

declare(strict_types=1);

namespace App\Support\Jwt;

use App\Support\Crypto\Base64Url;
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
        $json = Base64Url::decode($header);
        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($decoded)) {
            throw new RuntimeException('JWT header is invalid.');
        }

        return $decoded;
    }
}

<?php

declare(strict_types=1);

namespace App\Support\Identity;

use DateTimeInterface;
use Illuminate\Contracts\Encryption\DecryptException;
use RuntimeException;

final class GovernmentIdentifier
{
    public static function nik(?string $value): ?string
    {
        return self::digits($value, 16);
    }

    public static function nip(?string $value): ?string
    {
        return self::digits($value, 18);
    }

    public static function nisn(?string $value): ?string
    {
        return self::digits($value, 10);
    }

    public static function hashNik(string $nik): string
    {
        return self::requiredHash('nik', $nik);
    }

    public static function hashNip(string $nip): string
    {
        return self::requiredHash('nip', $nip);
    }

    public static function hashNisn(string $nisn): string
    {
        return self::requiredHash('nisn', $nisn);
    }

    public static function optionalNikHash(string $nik): ?string
    {
        return self::hash('nik', $nik);
    }

    public static function optionalNipHash(string $nip): ?string
    {
        return self::hash('nip', $nip);
    }

    public static function optionalNisnHash(string $nisn): ?string
    {
        return self::hash('nisn', $nisn);
    }

    public static function hashKeyConfigured(): bool
    {
        return self::identityHashKey() !== null;
    }

    public static function mask(?string $value): string
    {
        if ($value === null || $value === '') {
            return '-';
        }

        $digits = preg_replace('/\D/u', '', $value);
        if (! is_string($digits) || $digits === '') {
            return '****';
        }

        if (strlen($digits) <= 4) {
            return '****';
        }

        return substr($digits, 0, 2).'****'.substr($digits, -2);
    }

    /**
     * @param  callable(): mixed  $reader
     */
    public static function maskFrom(callable $reader): string
    {
        try {
            $value = $reader();
        } catch (DecryptException) {
            return '****';
        }

        if ($value === null) {
            return self::mask(null);
        }

        return self::mask(is_string($value) ? $value : (string) $value);
    }

    public static function maskBirthDate(?string $value): string
    {
        if ($value === null || $value === '') {
            return '-';
        }

        return preg_match('/^([0-9]{4})-[0-9]{2}-[0-9]{2}$/', $value, $matches) === 1
            ? 'YEAR-'.$matches[1]
            : 'YEAR-unknown';
    }

    /**
     * @param  callable(): mixed  $reader
     */
    public static function maskBirthDateFrom(callable $reader): string
    {
        try {
            $value = $reader();
        } catch (DecryptException) {
            return 'YEAR-unknown';
        }

        if ($value instanceof DateTimeInterface) {
            return self::maskBirthDate($value->format('Y-m-d'));
        }

        return is_string($value) || $value === null
            ? self::maskBirthDate($value)
            : 'YEAR-unknown';
    }

    private static function digits(?string $value, int $length): ?string
    {
        if ($value === null) {
            return null;
        }

        $candidate = preg_replace('/[\s.\-]/u', '', trim($value));

        if (! is_string($candidate) || $candidate === '') {
            return null;
        }

        return preg_match('/^[0-9]{'.$length.'}$/', $candidate) === 1 ? $candidate : null;
    }

    private static function requiredHash(string $purpose, string $value): string
    {
        $hash = self::hash($purpose, $value);
        if ($hash === null) {
            throw new RuntimeException('SSO_NIK_HASH_KEY must be configured before storing government identifiers.');
        }

        return $hash;
    }

    private static function hash(string $purpose, string $value): ?string
    {
        $key = self::identityHashKey();

        return $key === null ? null : hash_hmac('sha256', $purpose.':'.$value, $key);
    }

    private static function identityHashKey(): ?string
    {
        $key = (string) config('sso.identity.nik_hash_key', '');
        if ($key !== '') {
            return $key;
        }

        if (app()->environment('production')) {
            return null;
        }

        $fallback = (string) config('app.key', '');

        return $fallback !== '' ? $fallback : 'local-development-nik-hash-key';
    }
}

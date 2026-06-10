<?php

declare(strict_types=1);

namespace App\Support\Profile;

final class NameComposer
{
    public static function compose(?string $givenName, ?string $familyName): string
    {
        return implode(' ', array_values(array_filter([
            self::firstWord($givenName),
            self::firstWord($familyName),
        ], fn (?string $part): bool => $part !== null && $part !== '')));
    }

    /**
     * @return array{given_name: string|null, family_name: string|null}
     */
    public static function derive(?string $displayName): array
    {
        $words = self::words($displayName);

        return [
            'given_name' => $words[0] ?? null,
            'family_name' => count($words) > 1 ? $words[array_key_last($words)] : null,
        ];
    }

    public static function firstWord(?string $value): ?string
    {
        return self::words($value)[0] ?? null;
    }

    public static function hasMultipleWords(?string $value): bool
    {
        return count(self::words($value)) > 1;
    }

    /** @return list<string> */
    private static function words(?string $value): array
    {
        $normalized = trim((string) $value);
        if ($normalized === '') {
            return [];
        }

        $words = preg_split('/\s+/u', $normalized) ?: [];

        return array_values(array_filter($words, fn (string $word): bool => $word !== ''));
    }
}

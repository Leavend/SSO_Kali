<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final class ScopeSet
{
    /**
     * @return list<string>
     */
    public static function fromString(string $scope): array
    {
        $parts = preg_split('/\s+/', trim($scope)) ?: [];

        return array_values(array_filter($parts, static fn (string $item): bool => $item !== ''));
    }

    /**
     * @param  list<string>  $scopes
     */
    public static function toString(array $scopes): string
    {
        return implode(' ', array_values(array_unique($scopes)));
    }

    /**
     * @param  list<string>  $scopes
     */
    public static function contains(array $scopes, string $scope): bool
    {
        return in_array($scope, $scopes, true);
    }
}

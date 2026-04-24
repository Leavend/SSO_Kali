<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final class ClaimsView
{
    /**
     * @param  array<string, mixed>  $claims
     * @return list<string>
     */
    public static function scopes(array $claims): array
    {
        $scope = is_string($claims['scope'] ?? null) ? $claims['scope'] : '';

        return ScopeSet::fromString($scope);
    }

    /**
     * @param  array<string, mixed>  $claims
     * @return array<string, mixed>
     */
    public static function userInfo(array $claims): array
    {
        $scopes = self::scopes($claims);
        $payload = ['sub' => (string) $claims['sub']];

        return [
            ...$payload,
            ...self::profileClaims($claims, $scopes),
            ...self::emailClaims($claims, $scopes),
        ];
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  list<string>  $scopes
     * @return array<string, mixed>
     */
    private static function profileClaims(array $claims, array $scopes): array
    {
        if (! ScopeSet::contains($scopes, 'profile')) {
            return [];
        }

        return array_filter([
            'name' => $claims['name'] ?? null,
            'given_name' => $claims['given_name'] ?? null,
            'family_name' => $claims['family_name'] ?? null,
        ], static fn (mixed $value): bool => $value !== null);
    }

    /**
     * @param  array<string, mixed>  $claims
     * @param  list<string>  $scopes
     * @return array<string, mixed>
     */
    private static function emailClaims(array $claims, array $scopes): array
    {
        if (! ScopeSet::contains($scopes, 'email')) {
            return [];
        }

        return array_filter([
            'email' => $claims['email'] ?? null,
            'email_verified' => $claims['email_verified'] ?? null,
        ], static fn (mixed $value): bool => $value !== null);
    }
}

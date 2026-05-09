<?php

declare(strict_types=1);

namespace App\Support\Oidc;

final class OidcScope
{
    public const OPENID = 'openid';

    public const PROFILE = 'profile';

    public const EMAIL = 'email';

    public const OFFLINE_ACCESS = 'offline_access';

    public const ROLES = 'roles';

    public const PERMISSIONS = 'permissions';

    /**
     * @return array<string, array{description: string, claims: list<string>, default_allowed: bool}>
     */
    public static function catalog(): array
    {
        return [
            self::OPENID => [
                'description' => 'Required OpenID Connect authentication scope.',
                'claims' => ['sub', 'iss', 'aud', 'iat', 'exp'],
                'default_allowed' => true,
            ],
            self::PROFILE => [
                'description' => 'Basic profile claims for the authenticated subject.',
                'claims' => ['name', 'given_name', 'family_name'],
                'default_allowed' => true,
            ],
            self::EMAIL => [
                'description' => 'Email address and email verification state.',
                'claims' => ['email', 'email_verified'],
                'default_allowed' => true,
            ],
            self::OFFLINE_ACCESS => [
                'description' => 'Refresh-token eligible access for trusted clients.',
                'claims' => ['refresh_token'],
                'default_allowed' => true,
            ],
            self::ROLES => [
                'description' => 'Normalized RBAC role slugs assigned to the subject.',
                'claims' => ['roles'],
                'default_allowed' => false,
            ],
            self::PERMISSIONS => [
                'description' => 'Resolved least-privilege permission slugs for the subject.',
                'claims' => ['permissions'],
                'default_allowed' => false,
            ],
        ];
    }

    /**
     * @return list<string>
     */
    public static function names(): array
    {
        return array_keys(self::catalog());
    }

    /**
     * @return list<string>
     */
    public static function defaultAllowed(): array
    {
        return array_keys(array_filter(
            self::catalog(),
            static fn (array $scope): bool => $scope['default_allowed'],
        ));
    }
}

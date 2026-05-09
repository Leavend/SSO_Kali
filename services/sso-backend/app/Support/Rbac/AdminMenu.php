<?php

declare(strict_types=1);

namespace App\Support\Rbac;

final class AdminMenu
{
    public const DASHBOARD = 'dashboard';

    public const USERS = 'users';

    public const ROLES = 'roles';

    public const CLIENTS = 'clients';

    public const EXTERNAL_IDPS = 'external-idps';

    public const SESSIONS = 'sessions';

    public const AUDIT = 'audit';

    public const PROFILE = 'profile';

    /**
     * @return list<array{id: string, label: string, required_permission: string}>
     */
    public static function definitions(): array
    {
        return [
            [
                'id' => self::DASHBOARD,
                'label' => 'Dashboard',
                'required_permission' => AdminPermission::PANEL_VIEW,
            ],
            [
                'id' => self::USERS,
                'label' => 'Users',
                'required_permission' => AdminPermission::USERS_READ,
            ],
            [
                'id' => self::ROLES,
                'label' => 'Roles & Permissions',
                'required_permission' => AdminPermission::ROLES_READ,
            ],
            [
                'id' => self::CLIENTS,
                'label' => 'OAuth Clients',
                'required_permission' => AdminPermission::CLIENTS_READ,
            ],
            [
                'id' => self::EXTERNAL_IDPS,
                'label' => 'External IdPs',
                'required_permission' => AdminPermission::EXTERNAL_IDPS_READ,
            ],
            [
                'id' => self::SESSIONS,
                'label' => 'Sessions',
                'required_permission' => AdminPermission::SESSIONS_READ,
            ],
            [
                'id' => self::AUDIT,
                'label' => 'Audit Trail',
                'required_permission' => AdminPermission::AUDIT_READ,
            ],
            [
                'id' => self::PROFILE,
                'label' => 'Profile',
                'required_permission' => AdminPermission::PROFILE_READ,
            ],
        ];
    }

    /**
     * @return list<string>
     */
    public static function ids(): array
    {
        return array_map(
            fn (array $definition): string => $definition['id'],
            self::definitions(),
        );
    }
}

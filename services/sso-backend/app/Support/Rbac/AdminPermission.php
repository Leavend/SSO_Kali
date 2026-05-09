<?php

declare(strict_types=1);

namespace App\Support\Rbac;

final class AdminPermission
{
    public const PANEL_VIEW = 'admin.panel.view';

    public const USERS_READ = 'admin.users.read';

    public const USERS_WRITE = 'admin.users.write';

    public const ROLES_READ = 'admin.roles.read';

    public const ROLES_WRITE = 'admin.roles.write';

    public const CLIENTS_READ = 'admin.clients.read';

    public const CLIENTS_WRITE = 'admin.clients.write';

    public const EXTERNAL_IDPS_READ = 'admin.external-idps.read';

    public const EXTERNAL_IDPS_WRITE = 'admin.external-idps.write';

    public const SESSIONS_READ = 'admin.sessions.read';

    public const SESSIONS_TERMINATE = 'admin.sessions.terminate';

    public const AUDIT_READ = 'admin.audit.read';

    public const PROFILE_READ = 'profile.read';

    public const PROFILE_WRITE = 'profile.write';

    /**
     * @return list<string>
     */
    public static function all(): array
    {
        return [
            self::PANEL_VIEW,
            self::USERS_READ,
            self::USERS_WRITE,
            self::ROLES_READ,
            self::ROLES_WRITE,
            self::CLIENTS_READ,
            self::CLIENTS_WRITE,
            self::EXTERNAL_IDPS_READ,
            self::EXTERNAL_IDPS_WRITE,
            self::SESSIONS_READ,
            self::SESSIONS_TERMINATE,
            self::AUDIT_READ,
            self::PROFILE_READ,
            self::PROFILE_WRITE,
        ];
    }

    /**
     * @return list<string>
     */
    public static function adminDefaults(): array
    {
        return self::all();
    }

    /**
     * @return list<string>
     */
    public static function userDefaults(): array
    {
        return [
            self::PROFILE_READ,
            self::PROFILE_WRITE,
        ];
    }
}

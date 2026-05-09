<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;
use App\Support\Rbac\AdminMenu;
use App\Support\Rbac\AdminPermission;

final class AdminPermissionMatrix
{
    public function __construct(private readonly AdminRbacResolver $rbac) {}

    /**
     * @return array{view_admin_panel: bool, manage_sessions: bool, permissions: list<string>, capabilities: array<string, bool>, menus: list<array{id: string, label: string, required_permission: string, visible: bool}>}
     */
    public function for(User $user): array
    {
        return [
            'view_admin_panel' => $this->canViewAdminPanel($user),
            'manage_sessions' => $this->canManageSessions($user),
            'permissions' => $this->rbac->permissionsFor($user),
            'capabilities' => $this->capabilitiesFor($user),
            'menus' => $this->menusFor($user),
        ];
    }

    public function canViewAdminPanel(User $user): bool
    {
        return $this->rbac->allows($user, AdminPermission::PANEL_VIEW);
    }

    public function canManageSessions(User $user): bool
    {
        return in_array($user->role, $this->sessionManagementRoles(), true)
            && $this->canTerminateSessions($user);
    }

    public function canTerminateSessions(User $user): bool
    {
        return $this->rbac->allows($user, AdminPermission::SESSIONS_TERMINATE);
    }

    public function canManageUsers(User $user): bool
    {
        return $this->rbac->allows($user, AdminPermission::USERS_WRITE);
    }

    public function canManageRoles(User $user): bool
    {
        return $this->rbac->allows($user, AdminPermission::ROLES_WRITE);
    }

    public function canManageClients(User $user): bool
    {
        return $this->rbac->allows($user, AdminPermission::CLIENTS_WRITE);
    }

    public function canReadAuditTrail(User $user): bool
    {
        return $this->rbac->allows($user, AdminPermission::AUDIT_READ);
    }

    public function allows(User $user, string $permission): bool
    {
        return $this->rbac->allows($user, $permission);
    }

    /**
     * @return array<string, bool>
     */
    public function capabilitiesFor(User $user): array
    {
        $permissions = $this->rbac->permissionsFor($user);

        return collect(AdminPermission::all())
            ->mapWithKeys(fn (string $permission): array => [
                $permission => in_array($permission, $permissions, true),
            ])
            ->all();
    }

    /**
     * @return list<array{id: string, label: string, required_permission: string, visible: bool}>
     */
    public function menusFor(User $user): array
    {
        return array_map(
            fn (array $definition): array => [
                ...$definition,
                'visible' => $this->allows($user, $definition['required_permission']),
            ],
            AdminMenu::definitions(),
        );
    }

    public function canViewMenu(User $user, string $menuId): bool
    {
        foreach ($this->menusFor($user) as $menu) {
            if ($menu['id'] === $menuId) {
                return $menu['visible'];
            }
        }

        return false;
    }

    /**
     * @return list<string>
     */
    private function sessionManagementRoles(): array
    {
        $roles = config('sso.admin.session_management_roles', ['admin']);

        return is_array($roles) ? array_values(array_filter($roles, 'is_string')) : ['admin'];
    }
}

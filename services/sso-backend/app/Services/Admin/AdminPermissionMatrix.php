<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;
use App\Support\Rbac\AdminPermission;

final class AdminPermissionMatrix
{
    public function __construct(private readonly AdminRbacResolver $rbac) {}

    /**
     * @return array{view_admin_panel: bool, manage_sessions: bool, permissions: list<string>}
     */
    public function for(User $user): array
    {
        return [
            'view_admin_panel' => $this->canViewAdminPanel($user),
            'manage_sessions' => $this->canManageSessions($user),
            'permissions' => $this->rbac->permissionsFor($user),
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
     * @return list<string>
     */
    private function sessionManagementRoles(): array
    {
        $roles = config('sso.admin.session_management_roles', ['admin']);

        return is_array($roles) ? array_values(array_filter($roles, 'is_string')) : ['admin'];
    }
}

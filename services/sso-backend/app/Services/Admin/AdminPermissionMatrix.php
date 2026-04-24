<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;

final class AdminPermissionMatrix
{
    /**
     * @return array{view_admin_panel: bool, manage_sessions: bool}
     */
    public function for(User $user): array
    {
        return [
            'view_admin_panel' => $user->role === 'admin',
            'manage_sessions' => $this->canManageSessions($user),
        ];
    }

    public function canManageSessions(User $user): bool
    {
        return in_array($user->role, $this->sessionManagementRoles(), true);
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

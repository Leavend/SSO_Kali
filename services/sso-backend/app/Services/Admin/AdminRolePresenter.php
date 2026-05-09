<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;

final class AdminRolePresenter
{
    /**
     * @return array<string, mixed>
     */
    public function role(Role $role): array
    {
        $role->loadMissing('permissions');

        return [
            ...$role->only(['id', 'slug', 'name', 'description', 'is_system']),
            'permissions' => $role->permissions
                ->map(fn (Permission $permission): array => $permission->only(['slug', 'name', 'category']))
                ->sortBy('slug')
                ->values()
                ->all(),
            'users_count' => (int) ($role->users_count ?? $role->users()->count()),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function userRole(User $user): array
    {
        $user->loadMissing('roles');

        return [
            ...$user->only(['subject_id', 'email', 'display_name', 'role', 'status']),
            'roles' => $user->roles
                ->map(fn (Role $role): array => $role->only(['slug', 'name', 'is_system']))
                ->sortBy('slug')
                ->values()
                ->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function permission(Permission $permission): array
    {
        return $permission->only(['slug', 'name', 'description', 'category']);
    }
}

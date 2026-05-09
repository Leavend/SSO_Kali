<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Permission;
use App\Models\Role;

final class SyncRolePermissionsAction
{
    /**
     * @param  list<string>  $permissionSlugs
     */
    public function execute(Role $role, array $permissionSlugs): Role
    {
        $permissionIds = Permission::query()
            ->whereIn('slug', $permissionSlugs)
            ->pluck('id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();

        $role->permissions()->sync($permissionIds);

        return $role->refresh()->load('permissions');
    }
}

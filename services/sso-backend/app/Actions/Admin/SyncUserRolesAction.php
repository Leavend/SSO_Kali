<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Role;
use App\Models\User;

final class SyncUserRolesAction
{
    /**
     * @param  list<string>  $roleSlugs
     */
    public function execute(User $user, array $roleSlugs): User
    {
        $roleIds = Role::query()
            ->whereIn('slug', $roleSlugs)
            ->pluck('id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();

        $user->roles()->sync($roleIds);

        return $user->refresh()->load('roles');
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Role;
use RuntimeException;

final class DeleteManagedRoleAction
{
    public function execute(Role $role): void
    {
        if ($role->is_system) {
            throw new RuntimeException('System roles cannot be deleted.');
        }

        if ($role->users()->exists()) {
            throw new RuntimeException('Role still has assigned users.');
        }

        $role->permissions()->detach();
        $role->delete();
    }
}

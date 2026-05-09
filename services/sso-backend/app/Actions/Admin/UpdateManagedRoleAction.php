<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Role;
use RuntimeException;

final class UpdateManagedRoleAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(Role $role, array $data): Role
    {
        $this->assertMutable($role);

        $role->forceFill(array_intersect_key($data, array_flip(['name', 'description'])))->save();

        return $role->refresh()->load('permissions');
    }

    private function assertMutable(Role $role): void
    {
        if ($role->is_system) {
            throw new RuntimeException('System role metadata cannot be modified.');
        }
    }
}

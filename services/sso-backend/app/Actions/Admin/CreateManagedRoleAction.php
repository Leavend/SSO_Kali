<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Support\Facades\DB;

final class CreateManagedRoleAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data): Role
    {
        return DB::transaction(function () use ($data): Role {
            $role = Role::query()->create([
                'slug' => $data['slug'],
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
                'is_system' => false,
            ]);

            $permissionSlugs = $data['permission_slugs'] ?? [];

            if (is_array($permissionSlugs) && $permissionSlugs !== []) {
                $role->permissions()->sync($this->permissionIds($permissionSlugs));
            }

            return $role->load('permissions');
        });
    }

    /**
     * @param  list<string>  $permissionSlugs
     * @return list<int>
     */
    private function permissionIds(array $permissionSlugs): array
    {
        return Permission::query()
            ->whereIn('slug', $permissionSlugs)
            ->pluck('id')
            ->map(fn (mixed $id): int => (int) $id)
            ->all();
    }
}

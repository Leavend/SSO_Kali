<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;
use App\Support\Rbac\AdminPermission;

final class AdminRbacResolver
{
    /**
     * @return list<string>
     */
    public function permissionsFor(User $user): array
    {
        $permissions = $this->normalizedPermissions($user);

        if ($permissions === []) {
            $permissions = $this->legacyPermissions($user);
        }

        sort($permissions);

        return array_values(array_unique($permissions));
    }

    public function allows(User $user, string $permission): bool
    {
        return in_array($permission, $this->permissionsFor($user), true);
    }

    /**
     * @return list<string>
     */
    private function normalizedPermissions(User $user): array
    {
        return $user->roles()
            ->with('permissions:id,slug')
            ->get()
            ->flatMap(fn ($role) => $role->permissions->pluck('slug'))
            ->filter(fn ($slug): bool => is_string($slug) && $slug !== '')
            ->values()
            ->all();
    }

    /**
     * @return list<string>
     */
    private function legacyPermissions(User $user): array
    {
        return match ($user->role) {
            'admin' => AdminPermission::adminDefaults(),
            'user' => AdminPermission::userDefaults(),
            default => [],
        };
    }
}

<?php

declare(strict_types=1);

namespace App\Support\Admin;

use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use RuntimeException;

final class SingleRoleAssignment
{
    /**
     * Atomically assign a single role to a user, enforcing the single-role invariant.
     * This is the single enforcement point for the pivot ↔ column mirror.
     * Always use this method to assign roles; never call roles()->sync() directly.
     *
     * The sync() + save() pair is wrapped in a database transaction to ensure
     * both the pivot and column are updated atomically. If either fails, both are rolled back.
     *
     * @throws RuntimeException
     */
    public function assign(User $user, string $roleSlug): void
    {
        $role = Role::query()->where('slug', $roleSlug)->first();

        if (! $role instanceof Role) {
            throw new RuntimeException('Role not found.');
        }

        // Sync pivot table to single role and mirror to column atomically
        DB::transaction(function () use ($user, $role, $roleSlug): void {
            $user->roles()->sync([$role->id]);
            $user->forceFill(['role' => $roleSlug])->save();
        });
    }
}

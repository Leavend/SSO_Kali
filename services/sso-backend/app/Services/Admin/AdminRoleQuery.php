<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Collection;

final class AdminRoleQuery
{
    public function __construct(private readonly AdminRolePresenter $presenter) {}

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function roles(): Collection
    {
        return Role::query()
            ->with('permissions')
            ->withCount('users')
            ->orderBy('slug')
            ->get()
            ->map(fn (Role $role): array => $this->presenter->role($role));
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    public function permissions(): Collection
    {
        return Permission::query()
            ->orderBy('category')
            ->orderBy('slug')
            ->get()
            ->map(fn (Permission $permission): array => $this->presenter->permission($permission))
            ->values();
    }

    public function findRole(string $role): ?Role
    {
        return Role::query()->where('slug', $role)->first();
    }

    public function findUser(string $subjectId): ?User
    {
        return User::query()->where('subject_id', $subjectId)->first();
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\Role;
use App\Models\User;
use Illuminate\Support\Str;

final class CreateManagedUserAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(array $data): User
    {
        $user = User::query()->create([
            'subject_id' => $this->subjectId(),
            'email' => $data['email'],
            'password' => $data['password'] ?? null,
            'given_name' => $data['given_name'] ?? null,
            'family_name' => $data['family_name'] ?? null,
            'display_name' => $data['display_name'],
            'role' => $data['role'],
            'status' => 'active',
            'local_account_enabled' => (bool) ($data['local_account_enabled'] ?? false),
            'email_verified_at' => now(),
        ]);

        $this->attachRole($user, (string) $data['role']);

        return $user->refresh();
    }

    private function subjectId(): string
    {
        do {
            $subjectId = 'usr_'.Str::lower(Str::random(24));
        } while (User::query()->where('subject_id', $subjectId)->exists());

        return $subjectId;
    }

    private function attachRole(User $user, string $roleSlug): void
    {
        $role = Role::query()->where('slug', $roleSlug)->first();

        if ($role instanceof Role) {
            $user->roles()->syncWithoutDetaching([$role->id]);
        }
    }
}

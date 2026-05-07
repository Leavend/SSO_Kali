<?php

declare(strict_types=1);

namespace App\Services\Directory;

use App\Models\User;
use App\Repositories\UserRepository;
use Illuminate\Support\Facades\Hash;

final class DatabaseDirectoryUserProvider implements DirectoryUserProvider
{
    public function __construct(private readonly UserRepository $users) {}

    public function findByIdentifier(string $identifier): ?DirectoryUser
    {
        $user = $this->users->findByIdentifier($identifier);

        return $user instanceof User ? $this->fromModel($user) : null;
    }

    public function validatePassword(DirectoryUser $user, string $password): bool
    {
        if ($password === '') {
            return false;
        }

        $model = $this->users->findById($user->id);

        if (! $model instanceof User || ! is_string($model->password ?? null)) {
            return false;
        }

        return Hash::check($password, $model->password);
    }

    public function rolesFor(string $subjectId): array
    {
        $user = $this->users->findBySubjectId($subjectId);

        if (! $user instanceof User) {
            return [];
        }

        $role = is_string($user->role ?? null) && $user->role !== '' ? $user->role : 'user';

        return [$role];
    }

    private function fromModel(User $user): DirectoryUser
    {
        $role = is_string($user->role ?? null) && $user->role !== '' ? $user->role : 'user';

        return new DirectoryUser(
            id: (int) $user->getKey(),
            subjectId: $user->subject_id,
            email: $user->email,
            displayName: $user->display_name,
            roles: [$role],
        );
    }
}

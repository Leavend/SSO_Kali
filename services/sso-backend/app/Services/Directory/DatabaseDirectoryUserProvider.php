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

        if (! $model instanceof User) {
            return false;
        }

        // Bypass the 'hashed' cast to avoid RuntimeException when the stored
        // hash uses a different algorithm (e.g. bcrypt) than the configured
        // driver (argon2id). getRawOriginal() returns the raw DB value.
        $storedHash = $model->getRawOriginal('password');

        if (! is_string($storedHash) || $storedHash === '') {
            return false;
        }

        // Use password_verify() directly instead of Hash::check() because
        // Laravel 13's Argon2IdHasher throws RuntimeException when it encounters
        // a hash from a different algorithm (e.g. bcrypt). password_verify() is
        // algorithm-agnostic and handles all PHP-supported hash formats.
        if (! password_verify($password, $storedHash)) {
            return false;
        }

        // Transparent rehash: upgrade legacy hashes to the current algorithm.
        if (Hash::needsRehash($storedHash)) {
            $model->newQuery()
                ->whereKey($model->getKey())
                ->update(['password' => Hash::make($password)]);
        }

        return true;
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

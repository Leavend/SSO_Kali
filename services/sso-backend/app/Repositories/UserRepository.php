<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Models\User;

final class UserRepository
{
    public function findById(int $id): ?User
    {
        $user = User::query()->whereKey($id)->first();

        return $user instanceof User ? $user : null;
    }

    public function findBySubjectId(string $subjectId): ?User
    {
        $user = User::query()->where('subject_id', $subjectId)->first();

        return $user instanceof User ? $user : null;
    }

    public function findByIdentifier(string $identifier): ?User
    {
        $normalized = mb_strtolower(trim($identifier));

        if ($normalized === '') {
            return null;
        }

        $user = User::query()
            ->where('email', $normalized)
            ->orWhere('subject_id', $identifier)
            ->first();

        return $user instanceof User ? $user : null;
    }
}

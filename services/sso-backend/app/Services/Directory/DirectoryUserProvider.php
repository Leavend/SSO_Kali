<?php

declare(strict_types=1);

namespace App\Services\Directory;

interface DirectoryUserProvider
{
    public function findByIdentifier(string $identifier): ?DirectoryUser;

    public function validatePassword(DirectoryUser $user, string $password): bool;

    /**
     * @return list<string>
     */
    public function rolesFor(string $subjectId): array;
}

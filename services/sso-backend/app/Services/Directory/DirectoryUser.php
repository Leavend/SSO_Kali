<?php

declare(strict_types=1);

namespace App\Services\Directory;

final readonly class DirectoryUser
{
    /**
     * @param  list<string>  $roles
     */
    public function __construct(
        public int $id,
        public string $subjectId,
        public string $email,
        public string $displayName,
        public array $roles,
        public string $status = 'active',
    ) {}

    /**
     * @return array{id: int, subject_id: string, email: string, display_name: string, roles: list<string>, status: string}
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'subject_id' => $this->subjectId,
            'email' => $this->email,
            'display_name' => $this->displayName,
            'roles' => $this->roles,
            'status' => $this->status,
        ];
    }
}

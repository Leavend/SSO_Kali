<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\User;
use Illuminate\Support\Collection;

final class AdminUserQuery
{
    public function __construct(private readonly AdminUserPresenter $presenter) {}

    /**
     * @return Collection<int, mixed>
     */
    public function users(): Collection
    {
        return User::query()
            ->select($this->presenter->columns())
            ->orderByDesc('last_login_at')
            ->get()
            ->map(fn (User $user): array => [
                ...$this->presenter->user($user),
                'login_context' => $this->presenter->latestLoginContext($user->subject_id),
            ]);
    }

    public function find(string $subjectId): ?User
    {
        return User::query()->where('subject_id', $subjectId)->first();
    }
}

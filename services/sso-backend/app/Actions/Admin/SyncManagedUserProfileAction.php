<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;

final class SyncManagedUserProfileAction
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function execute(User $target, array $data): User
    {
        $target->forceFill([
            ...array_intersect_key($data, array_flip([
                'email',
                'display_name',
                'given_name',
                'family_name',
            ])),
            'profile_synced_at' => now(),
        ])->save();

        return $target->refresh();
    }
}

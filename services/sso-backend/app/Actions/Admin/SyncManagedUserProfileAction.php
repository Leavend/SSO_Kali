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
        $changes = array_intersect_key($data, array_flip([
            'email',
            'display_name',
            'given_name',
            'family_name',
        ]));

        if (array_key_exists('email', $changes) && $changes['email'] !== $target->email) {
            $changes['email_verified_at'] = null;
        }

        $target->forceFill([
            ...$changes,
            'profile_synced_at' => now(),
        ])->save();

        return $target->refresh();
    }
}

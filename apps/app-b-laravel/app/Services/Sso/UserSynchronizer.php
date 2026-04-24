<?php

declare(strict_types=1);

namespace App\Services\Sso;

use App\Models\User;

final class UserSynchronizer
{
    /**
     * @param  array<string, mixed>  $claims
     * @param  array<string, mixed>  $profile
     */
    public function sync(array $claims, array $profile): User
    {
        $resourceProfile = is_array($profile['resource_profile'] ?? null) ? $profile['resource_profile'] : [];

        return User::query()->updateOrCreate(
            ['subject_id' => (string) $claims['sub']],
            [
                'email' => (string) ($resourceProfile['email'] ?? $claims['email'] ?? 'unknown@example.com'),
                'display_name' => (string) ($resourceProfile['display_name'] ?? $claims['name'] ?? 'Unknown User'),
                'last_synced_at' => now(),
            ],
        );
    }
}

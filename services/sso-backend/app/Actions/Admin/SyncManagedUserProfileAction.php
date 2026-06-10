<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Support\Profile\NameComposer;

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

        $hasNameInput = array_key_exists('given_name', $changes) || array_key_exists('family_name', $changes);

        if (array_key_exists('given_name', $changes)) {
            $changes['given_name'] = NameComposer::firstWord(is_string($changes['given_name']) ? $changes['given_name'] : null);
        }

        if (array_key_exists('family_name', $changes)) {
            $changes['family_name'] = NameComposer::firstWord(is_string($changes['family_name']) ? $changes['family_name'] : null);
        }

        if ($hasNameInput) {
            $givenName = array_key_exists('given_name', $changes)
                ? (is_string($changes['given_name']) ? $changes['given_name'] : null)
                : $target->given_name;
            $familyName = array_key_exists('family_name', $changes)
                ? (is_string($changes['family_name']) ? $changes['family_name'] : null)
                : $target->family_name;
            $displayName = NameComposer::compose(
                $givenName,
                $familyName,
            );

            if ($displayName !== '') {
                $changes['display_name'] = $displayName;
            }
        }

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

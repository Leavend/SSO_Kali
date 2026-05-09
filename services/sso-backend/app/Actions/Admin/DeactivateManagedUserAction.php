<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use RuntimeException;

final class DeactivateManagedUserAction
{
    public function execute(User $target, User $admin, string $reason): User
    {
        if ($target->is($admin)) {
            throw new RuntimeException('Administrators cannot deactivate their own account.');
        }

        $target->forceFill([
            'status' => 'disabled',
            'disabled_at' => now(),
            'disabled_reason' => $reason,
        ])->save();

        return $target->refresh();
    }
}

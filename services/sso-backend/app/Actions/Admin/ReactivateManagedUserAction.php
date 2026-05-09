<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;

final class ReactivateManagedUserAction
{
    public function execute(User $target): User
    {
        $target->forceFill([
            'status' => 'active',
            'disabled_at' => null,
            'disabled_reason' => null,
        ])->save();

        return $target->refresh();
    }
}

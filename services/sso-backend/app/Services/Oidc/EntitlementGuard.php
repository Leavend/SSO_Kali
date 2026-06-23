<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\User;
use App\Support\Oidc\ClientCategory;
use App\Support\Oidc\DownstreamClient;

final class EntitlementGuard
{
    public function allows(User $user, DownstreamClient $client): bool
    {
        $category = ClientCategory::tryFrom($client->category);

        return match ($category) {
            ClientCategory::Public => true,
            ClientCategory::Staffing => $this->hasStaffingEntitlement($user),
            null => false,
        };
    }

    private function hasStaffingEntitlement(User $user): bool
    {
        $roles = $user->roles()->pluck('slug')->all();

        if ($roles === [] && $user->role !== '') {
            $roles = [$user->role];
        }

        return in_array('pegawai', $roles, true) || in_array('admin', $roles, true);
    }
}

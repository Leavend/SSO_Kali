<?php

declare(strict_types=1);

namespace App\Services\Oidc;

use App\Models\OidcClientEntitlement;
use App\Models\User;
use App\Support\Identity\StaffingRoles;
use App\Support\Oidc\ClientCategory;
use App\Support\Oidc\DownstreamClient;

final class EntitlementGuard
{
    public function allows(User $user, DownstreamClient $client): bool
    {
        $category = ClientCategory::tryFrom($client->category);

        return match ($category) {
            ClientCategory::Public => true,
            ClientCategory::Staffing => $this->hasStaffingRole($user) && $this->hasClientEntitlement($user, $client),
            null => false,
        };
    }

    public function hasClientEntitlement(User $user, DownstreamClient $client): bool
    {
        return OidcClientEntitlement::query()
            ->where('client_id', $client->clientId)
            ->where('user_id', $user->getKey())
            ->whereNull('revoked_at')
            ->exists();
    }

    private function hasStaffingRole(User $user): bool
    {
        $roles = $user->roles()->pluck('slug')->all();

        if ($roles === [] && $user->role !== '') {
            $roles = [$user->role];
        }

        return StaffingRoles::matchedBy($roles);
    }
}

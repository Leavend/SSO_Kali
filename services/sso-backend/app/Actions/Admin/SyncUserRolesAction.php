<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Exceptions\RoleManagementException;
use App\Models\User;
use App\Support\Admin\ProtectedAccountPolicy;
use App\Support\Admin\SingleRoleAssignment;

final class SyncUserRolesAction
{
    public function __construct(
        private readonly ProtectedAccountPolicy $protectedAccounts,
        private readonly SingleRoleAssignment $singleRoleAssignment,
    ) {}

    /**
     * @param  list<string>  $roleSlugs
     *
     * @throws RoleManagementException User-facing error message
     */
    public function execute(User $actor, User $user, array $roleSlugs): User
    {
        $nextRoleSlug = $roleSlugs[0] ?? null;
        if (! is_string($nextRoleSlug) || $nextRoleSlug === '') {
            throw new RoleManagementException('A single role is required.');
        }

        if ($this->protectedAccounts->wouldDemoteProtectedAccount($user, $nextRoleSlug)) {
            throw new RoleManagementException('Akun terproteksi (whitelist) — role tidak dapat diubah.');
        }

        if ($this->protectedAccounts->wouldSelfDemoteLastAdmin($actor, $user, $nextRoleSlug)) {
            throw new RoleManagementException('Admin terakhir tidak dapat menurunkan perannya sendiri.');
        }

        $this->singleRoleAssignment->assign($user, $nextRoleSlug);

        return $user->refresh()->load('roles');
    }
}

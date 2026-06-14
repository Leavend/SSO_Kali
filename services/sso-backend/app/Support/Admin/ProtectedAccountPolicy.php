<?php

declare(strict_types=1);

namespace App\Support\Admin;

use App\Models\Role;
use App\Models\User;

final class ProtectedAccountPolicy
{
    /**
     * Get the privileged role slugs from config.
     * session_management_roles is an array (via $csv env), defaults to ['admin'].
     *
     * @return list<string>
     */
    private function privilegedRoleSlugs(): array
    {
        $roles = config('sso.admin.session_management_roles', ['admin']);
        if (! is_array($roles)) {
            return ['admin'];
        }

        return array_values(array_filter($roles, 'is_string'));
    }

    /**
     * Check if a role slug is a privileged role (one that requires protection).
     */
    private function isPrivilegedRole(string $slug): bool
    {
        return in_array($slug, $this->privilegedRoleSlugs(), true);
    }

    public function isProtected(User $user): bool
    {
        return in_array(mb_strtolower($user->email), $this->protectedEmails(), true);
    }

    public function wouldDemoteProtectedAccount(User $user, string $nextRoleSlug): bool
    {
        return $this->isProtected($user) && ! $this->isPrivilegedRole($nextRoleSlug);
    }

    public function wouldSelfDemoteLastAdmin(User $actor, User $target, string $nextRoleSlug): bool
    {
        if ($actor->isNot($target)) {
            return false;
        }

        if ($this->isPrivilegedRole($nextRoleSlug)) {
            return false;
        }

        return $this->adminCount() <= 1;
    }

    /**
     * @return list<string>
     */
    private function protectedEmails(): array
    {
        $emails = config('sso.admin_emails', []);
        if (! is_array($emails)) {
            return [];
        }

        return array_values(array_filter(array_map(
            static fn (mixed $email): string => is_string($email) ? mb_strtolower(trim($email)) : '',
            $emails,
        )));
    }

    private function adminCount(): int
    {
        $count = 0;
        foreach ($this->privilegedRoleSlugs() as $slug) {
            $adminRole = Role::query()->where('slug', $slug)->first();
            if ($adminRole instanceof Role) {
                $count += $adminRole->users()->count();
            }
        }

        return $count;
    }
}

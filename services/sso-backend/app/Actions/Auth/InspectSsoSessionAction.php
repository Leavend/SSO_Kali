<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Services\Directory\DirectoryUserProvider;
use App\Services\Session\SsoSessionService;

final readonly class InspectSsoSessionAction
{
    public function __construct(
        private SsoSessionService $sessions,
        private DirectoryUserProvider $directory,
    ) {}

    public function execute(?string $sessionId): InspectSsoSessionResult
    {
        $user = $this->sessions->currentUser($sessionId);

        if (! $user instanceof User) {
            return new InspectSsoSessionResult(false);
        }

        return new InspectSsoSessionResult(true, [
            'id' => (int) $user->getKey(),
            'subject_id' => $user->subject_id,
            'email' => $user->email,
            'display_name' => $user->display_name,
            'roles' => $this->resolveRoles($user),
        ]);
    }

    /**
     * Merge directory role with RBAC relationship roles for consistency
     * with ProfilePrincipalResolver (ISSUE-04 alignment).
     *
     * @return list<string>
     */
    private function resolveRoles(User $user): array
    {
        $directoryRoles = $this->directory->rolesFor($user->subject_id);
        $rbacRoles = $user->roles()->pluck('slug')->all();

        return array_values(array_unique(array_merge($directoryRoles, $rbacRoles)));
    }
}

<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\User;
use App\Services\Admin\AdminSessionService;
use App\Services\Oidc\RefreshTokenStore;
use RuntimeException;

/**
 * FR-022 / UC-50: Admin disable user.
 *
 * Disables the user account AND revokes all active sessions and tokens
 * to prevent continued access via existing credentials.
 */
final class DeactivateManagedUserAction
{
    public function __construct(
        private readonly AdminSessionService $sessions,
        private readonly RefreshTokenStore $refreshTokens,
    ) {}

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

        // FR-022 ISSUE-01: Revoke all active sessions
        $this->sessions->revokeAllUserSessions($target->subject_id);

        // FR-022 ISSUE-02: Revoke all refresh tokens
        $this->refreshTokens->revokeSubject($target->subject_id);

        return $target->refresh();
    }
}

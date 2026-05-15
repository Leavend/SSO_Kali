<?php

declare(strict_types=1);

namespace App\Actions\Admin;

use App\Models\MfaCredential;
use App\Models\MfaRecoveryCode;
use App\Models\User;
use App\Notifications\MfaDisabledNotification;
use App\Services\Admin\AdminSessionService;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * FR-020 / UC-76 / BE-FR020-001 — Emergency lost-factor MFA reset by admin.
 *
 * The admin must justify the reset with a redacted, structured reason.
 * The action atomically:
 *  - removes the verified TOTP credential and any pending enrollments;
 *  - invalidates all stored recovery codes (used or not);
 *  - flags the user as `mfa_reset_required` so every subsequent privileged
 *    request returns `mfa_reenrollment_required` until a fresh second factor
 *    is enrolled (see `EnsureMfaReenrollmentCompleted`);
 *  - revokes every active session and refresh token for the user (so a
 *    stolen device cannot keep using a session that was set up under the
 *    old factor);
 *  - dispatches the `MfaDisabledNotification` (admin variant).
 *
 * Audit: the controller (`AdminMutationResponder`) writes the
 * `emergency_mfa_reset` admin audit event with the redacted reason, IP, UA,
 * and admin actor. This action MUST throw on any precondition failure so
 * the responder records a `failed` audit entry instead of a `succeeded` one.
 */
final class EmergencyMfaResetAction
{
    private const REASON_MIN = 8;

    private const REASON_MAX = 240;

    public function __construct(
        private readonly AdminSessionService $sessions,
    ) {}

    /**
     * @throws RuntimeException
     */
    public function execute(User $targetUser, User $admin, string $reason): void
    {
        $normalisedReason = $this->normaliseReason($reason);

        $hasCredential = MfaCredential::query()
            ->forUser($targetUser->getKey())
            ->totp()
            ->exists();

        $hasResidualCodes = MfaRecoveryCode::query()
            ->forUser($targetUser->getKey())
            ->exists();

        if (! $hasCredential && ! $hasResidualCodes && ! $targetUser->mfa_reset_required) {
            throw new RuntimeException('User does not have MFA enrolled.');
        }

        DB::transaction(function () use ($targetUser, $admin, $normalisedReason): void {
            // Wipe both pending and verified TOTP credentials.
            MfaCredential::query()
                ->forUser($targetUser->getKey())
                ->totp()
                ->delete();

            // Used codes too: any remnant must not survive the reset so that
            // a stolen backup paper sheet cannot be replayed.
            MfaRecoveryCode::query()
                ->forUser($targetUser->getKey())
                ->delete();

            $targetUser->forceFill([
                'mfa_reset_required' => true,
                'mfa_reset_at' => now(),
                'mfa_reset_reason' => $normalisedReason,
                'mfa_reset_by_user_id' => $admin->getKey(),
            ])->save();
        });

        // Side effects after the transactional state is durable.
        $this->sessions->revokeAllUserSessions($targetUser->subject_id);

        if (config('security-notifications.enabled', true)) {
            $targetUser->notify(new MfaDisabledNotification(byAdmin: true));
        }
    }

    private function normaliseReason(string $reason): string
    {
        $trimmed = trim($reason);
        $length = mb_strlen($trimmed);

        if ($length < self::REASON_MIN) {
            throw new RuntimeException('Emergency MFA reset reason is too short.');
        }

        if ($length > self::REASON_MAX) {
            $trimmed = mb_substr($trimmed, 0, self::REASON_MAX);
        }

        return $trimmed;
    }
}

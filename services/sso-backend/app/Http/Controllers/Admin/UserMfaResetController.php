<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\EmergencyMfaResetAction;
use App\Http\Requests\Admin\EmergencyMfaResetRequest;
use App\Models\User;
use App\Services\Admin\AdminMutationResponder;
use App\Services\Admin\AdminUserQuery;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;

/**
 * BE-FR020-001 — Emergency lost-factor MFA reset endpoint.
 *
 * The full lost-factor recovery workflow is documented on
 * `App\Actions\Admin\EmergencyMfaResetAction`. This thin controller is split
 * out from `UserController` so the production line-count guardrail (max 100
 * lines per admin controller) keeps holding.
 */
final class UserMfaResetController
{
    public function __construct(
        private readonly AdminUserQuery $users,
        private readonly AdminMutationResponder $mutations,
    ) {}

    public function __invoke(
        EmergencyMfaResetRequest $request,
        EmergencyMfaResetAction $action,
        string $subjectId,
    ): JsonResponse {
        $target = $this->users->find($subjectId);

        if (! $target instanceof User) {
            return AdminApiResponse::error('not_found', 'User not found.', 404);
        }

        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');
        $reason = (string) $request->validated('reason');

        return $this->mutations->run(
            $request,
            'emergency_mfa_reset',
            [
                'target_subject_id' => $subjectId,
                'reason' => $reason,
                'reason_length' => mb_strlen($reason),
            ],
            fn (): array => tap(
                [
                    'reset' => true,
                    'message' => 'MFA credential removed. The user must re-enroll a second factor before continuing.',
                    'reenrollment_required' => true,
                ],
                fn () => $action->execute($target, $admin, $reason),
            ),
            'User management action failed.',
        );
    }
}

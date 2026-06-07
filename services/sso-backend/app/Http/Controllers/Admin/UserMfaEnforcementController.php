<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\RequireUserMfaAction;
use App\Actions\Admin\UnrequireUserMfaAction;
use App\Models\User;
use App\Services\Admin\AdminMutationResponder;
use App\Services\Admin\AdminUserPresenter;
use App\Services\Admin\AdminUserQuery;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class UserMfaEnforcementController
{
    public function __construct(
        private readonly AdminUserQuery $users,
        private readonly AdminUserPresenter $presenter,
        private readonly AdminMutationResponder $mutations,
    ) {}

    public function requireMfa(Request $request, RequireUserMfaAction $action, string $subjectId): JsonResponse
    {
        $payload = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $target = $this->users->find($subjectId);
        if (! $target instanceof User) {
            return AdminApiResponse::error('not_found', 'User not found.', 404);
        }

        return $this->mutations->run(
            $request,
            'require_user_mfa',
            ['target_subject_id' => $subjectId, 'reason' => $payload['reason']],
            fn (): array => ['user' => $this->presenter->user($action->execute($target, $request->attributes->get('admin_user'), $request, $payload['reason']))],
            'Require user MFA action failed.',
        );
    }

    public function unrequireMfa(Request $request, UnrequireUserMfaAction $action, string $subjectId): JsonResponse
    {
        $payload = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $target = $this->users->find($subjectId);
        if (! $target instanceof User) {
            return AdminApiResponse::error('not_found', 'User not found.', 404);
        }

        return $this->mutations->run(
            $request,
            'unrequire_user_mfa',
            ['target_subject_id' => $subjectId, 'reason' => $payload['reason']],
            fn (): array => ['user' => $this->presenter->user($action->execute($target, $request->attributes->get('admin_user'), $request, $payload['reason']))],
            'Unrequire user MFA action failed.',
        );
    }
}

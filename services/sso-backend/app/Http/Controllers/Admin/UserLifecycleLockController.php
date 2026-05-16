<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\LockManagedUserAction;
use App\Actions\Admin\UnlockManagedUserAction;
use App\Models\User;
use App\Services\Admin\AdminMutationResponder;
use App\Services\Admin\AdminUserPresenter;
use App\Services\Admin\AdminUserQuery;
use App\Support\Responses\AdminApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

final class UserLifecycleLockController
{
    public function __construct(
        private readonly AdminUserQuery $users,
        private readonly AdminUserPresenter $presenter,
        private readonly AdminMutationResponder $mutations,
    ) {}

    public function lock(Request $request, LockManagedUserAction $action, string $subjectId): JsonResponse
    {
        $payload = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'locked_until' => ['nullable', 'date', 'after:now'],
        ]);

        $target = $this->users->find($subjectId);
        if (! $target instanceof User) {
            return AdminApiResponse::error('not_found', 'User not found.', 404);
        }

        return $this->mutations->run(
            $request,
            'lock_managed_user',
            ['target_subject_id' => $subjectId, 'reason' => $payload['reason'], 'locked_until' => $payload['locked_until'] ?? null],
            fn (): array => ['user' => $this->presenter->user($action->execute($target, $request->attributes->get('admin_user'), $request, $payload['reason'], isset($payload['locked_until']) ? Carbon::parse($payload['locked_until']) : null))],
            'User lock action failed.',
        );
    }

    public function unlock(Request $request, UnlockManagedUserAction $action, string $subjectId): JsonResponse
    {
        $payload = $request->validate([
            'reason' => ['nullable', 'string', 'max:255'],
        ]);

        $target = $this->users->find($subjectId);
        if (! $target instanceof User) {
            return AdminApiResponse::error('not_found', 'User not found.', 404);
        }

        return $this->mutations->run(
            $request,
            'unlock_managed_user',
            ['target_subject_id' => $subjectId, 'reason' => $payload['reason'] ?? null],
            fn (): array => ['user' => $this->presenter->user($action->execute($target, $request->attributes->get('admin_user'), $request, $payload['reason'] ?? null))],
            'User unlock action failed.',
        );
    }
}

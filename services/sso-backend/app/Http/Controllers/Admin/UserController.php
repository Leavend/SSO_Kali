<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\CreateManagedUserAction;
use App\Actions\Admin\DeactivateManagedUserAction;
use App\Actions\Admin\IssueManagedUserPasswordResetAction;
use App\Actions\Admin\ReactivateManagedUserAction;
use App\Actions\Admin\SyncManagedUserProfileAction;
use App\Http\Requests\Admin\CreateManagedUserRequest;
use App\Http\Requests\Admin\DeactivateManagedUserRequest;
use App\Http\Requests\Admin\SyncManagedUserProfileRequest;
use App\Models\User;
use App\Services\Admin\AdminMutationResponder;
use App\Services\Admin\AdminSessionService;
use App\Services\Admin\AdminUserPresenter;
use App\Services\Admin\AdminUserQuery;
use App\Support\Responses\AdminApiResponse;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class UserController
{
    public function __construct(
        private readonly AdminSessionService $sessions,
        private readonly AdminUserQuery $users,
        private readonly AdminUserPresenter $presenter,
        private readonly AdminMutationResponder $mutations,
    ) {}

    public function index(): JsonResponse
    {
        return AdminApiResponse::ok(['users' => $this->users->users()]);
    }

    public function show(string $subjectId): JsonResponse
    {
        $user = $this->users->find($subjectId);

        return $user instanceof User
            ? AdminApiResponse::ok(['user' => $this->presenter->user($user), 'login_context' => $this->presenter->latestLoginContext($subjectId), 'sessions' => $this->sessions->sessionsForUser($subjectId)])
            : AdminApiResponse::error('not_found', 'User not found.', 404);
    }

    public function store(CreateManagedUserRequest $request, CreateManagedUserAction $action): JsonResponse
    {
        return $this->mutate($request, 'create_managed_user', ['email' => $request->validated('email'), 'role' => $request->validated('role')], fn (): array => ['user' => $this->presenter->user($action->execute($request->validated()))], 201);
    }

    public function deactivate(DeactivateManagedUserRequest $request, DeactivateManagedUserAction $action, string $subjectId): JsonResponse
    {
        return $this->mutateUser($request, $subjectId, 'deactivate_managed_user', fn (User $target, User $admin): User => $action->execute($target, $admin, $request->validated('reason')), ['reason' => $request->validated('reason')]);
    }

    public function reactivate(Request $request, ReactivateManagedUserAction $action, string $subjectId): JsonResponse
    {
        return $this->mutateUser($request, $subjectId, 'reactivate_managed_user', fn (User $target): User => $action->execute($target));
    }

    public function issuePasswordReset(Request $request, IssueManagedUserPasswordResetAction $action, string $subjectId): JsonResponse
    {
        return ($target = $this->users->find($subjectId)) instanceof User
            ? $this->mutate($request, 'issue_managed_user_password_reset', ['target_subject_id' => $subjectId], fn (): array => $this->presenter->passwordReset($action->execute($target)))
            : AdminApiResponse::error('not_found', 'User not found.', 404);
    }

    public function syncProfile(SyncManagedUserProfileRequest $request, SyncManagedUserProfileAction $action, string $subjectId): JsonResponse
    {
        return $this->mutateUser($request, $subjectId, 'sync_managed_user_profile', fn (User $target): User => $action->execute($target, $request->validated()));
    }

    /** @param Closure(): array<string, mixed> $callback */
    private function mutate(Request $request, string $action, array $context, Closure $callback, int $status = 200): JsonResponse
    {
        return $this->mutations->run($request, $action, $context, $callback, 'User management action failed.', $status);
    }

    /** @param Closure(User, User): User $callback */
    private function mutateUser(Request $request, string $subjectId, string $action, Closure $callback, array $context = []): JsonResponse
    {
        $target = $this->users->find($subjectId);

        return $target instanceof User
            ? $this->mutate($request, $action, ['target_subject_id' => $subjectId, ...$context], fn (): array => ['user' => $this->presenter->user($callback($target, $request->attributes->get('admin_user')))])
            : AdminApiResponse::error('not_found', 'User not found.', 404);
    }
}

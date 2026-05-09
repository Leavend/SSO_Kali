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
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use App\Services\Admin\AdminSessionService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

final class UserController
{
    public function __construct(
        private readonly AdminSessionService $sessions,
        private readonly AdminAuditLogger $audit,
    ) {}

    public function index(): JsonResponse
    {
        $users = User::query()
            ->select($this->userColumns())
            ->orderByDesc('last_login_at')
            ->get()
            ->map(fn (User $user): array => [
                ...$this->userPayload($user),
                'login_context' => $this->latestLoginContext($user->subject_id),
            ]);

        return response()->json(['users' => $users]);
    }

    public function show(string $subjectId): JsonResponse
    {
        $user = $this->findUser($subjectId);

        if (! $user instanceof User) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        return response()->json([
            'user' => $this->userPayload($user),
            'login_context' => $this->latestLoginContext($subjectId),
            'sessions' => $this->sessions->sessionsForUser($subjectId),
        ]);
    }

    public function store(CreateManagedUserRequest $request, CreateManagedUserAction $action): JsonResponse
    {
        return $this->runMutation(
            $request,
            'create_managed_user',
            ['email' => $request->validated('email'), 'role' => $request->validated('role')],
            fn (): array => ['user' => $this->userPayload($action->execute($request->validated()))],
            201,
        );
    }

    public function deactivate(
        DeactivateManagedUserRequest $request,
        DeactivateManagedUserAction $action,
        string $subjectId,
    ): JsonResponse {
        return $this->mutateExistingUser(
            $request,
            $subjectId,
            'deactivate_managed_user',
            fn (User $target, User $admin): User => $action->execute($target, $admin, $request->validated('reason')),
            ['reason' => $request->validated('reason')],
        );
    }

    public function reactivate(Request $request, ReactivateManagedUserAction $action, string $subjectId): JsonResponse
    {
        return $this->mutateExistingUser(
            $request,
            $subjectId,
            'reactivate_managed_user',
            fn (User $target): User => $action->execute($target),
        );
    }

    public function issuePasswordReset(
        Request $request,
        IssueManagedUserPasswordResetAction $action,
        string $subjectId,
    ): JsonResponse {
        $target = $this->findUser($subjectId);

        if (! $target instanceof User) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        return $this->runMutation(
            $request,
            'issue_managed_user_password_reset',
            ['target_subject_id' => $subjectId],
            fn (): array => $this->passwordResetPayload($action->execute($target)),
        );
    }

    public function syncProfile(
        SyncManagedUserProfileRequest $request,
        SyncManagedUserProfileAction $action,
        string $subjectId,
    ): JsonResponse {
        return $this->mutateExistingUser(
            $request,
            $subjectId,
            'sync_managed_user_profile',
            fn (User $target): User => $action->execute($target, $request->validated()),
        );
    }

    /**
     * @return array<string, mixed>|null
     */
    private function latestLoginContext(string $subjectId): ?array
    {
        $ctx = DB::table('login_contexts')
            ->where('subject_id', $subjectId)
            ->orderByDesc('id')
            ->first();

        if ($ctx === null) {
            return null;
        }

        return [
            'ip_address' => $ctx->ip_address,
            'risk_score' => $ctx->risk_score,
            'mfa_required' => (bool) $ctx->mfa_required,
            'last_seen_at' => $ctx->last_seen_at,
        ];
    }

    /**
     * @return array<string>
     */
    private function userColumns(): array
    {
        return [
            'id',
            'subject_id',
            'email',
            'given_name',
            'family_name',
            'display_name',
            'role',
            'status',
            'disabled_at',
            'disabled_reason',
            'local_account_enabled',
            'profile_synced_at',
            'last_login_at',
            'created_at',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function userPayload(User $user): array
    {
        return $user->only($this->userColumns());
    }

    private function findUser(string $subjectId): ?User
    {
        return User::query()->where('subject_id', $subjectId)->first();
    }

    /**
     * @param  Closure(): array<string, mixed>  $callback
     */
    private function runMutation(
        Request $request,
        string $action,
        array $context,
        Closure $callback,
        int $status = 200,
    ): JsonResponse {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');

        try {
            $result = $callback();
        } catch (Throwable $exception) {
            $this->audit->failed($action, $request, $admin, $exception, $context, AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);

            return response()->json(['error' => 'User management action failed.'], 422);
        }

        $this->audit->succeeded($action, $request, $admin, $context, AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);

        return response()->json($result, $status);
    }

    /**
     * @param  Closure(User, User): User  $callback
     */
    private function mutateExistingUser(
        Request $request,
        string $subjectId,
        string $action,
        Closure $callback,
        array $context = [],
    ): JsonResponse {
        $target = $this->findUser($subjectId);

        if (! $target instanceof User) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        return $this->runMutation(
            $request,
            $action,
            ['target_subject_id' => $subjectId, ...$context],
            fn (): array => ['user' => $this->userPayload($callback($target, $request->attributes->get('admin_user')))],
        );
    }

    /**
     * @param  array{user: User, reset_token: string, expires_at: string}  $result
     * @return array<string, mixed>
     */
    private function passwordResetPayload(array $result): array
    {
        return [
            'user' => $this->userPayload($result['user']),
            'password_reset' => [
                'token' => $result['reset_token'],
                'expires_at' => $result['expires_at'],
            ],
        ];
    }
}

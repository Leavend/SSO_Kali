<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Actions\Admin\CreateManagedRoleAction;
use App\Actions\Admin\DeleteManagedRoleAction;
use App\Actions\Admin\SyncRolePermissionsAction;
use App\Actions\Admin\SyncUserRolesAction;
use App\Actions\Admin\UpdateManagedRoleAction;
use App\Http\Requests\Admin\StoreManagedRoleRequest;
use App\Http\Requests\Admin\SyncRolePermissionsRequest;
use App\Http\Requests\Admin\SyncUserRolesRequest;
use App\Http\Requests\Admin\UpdateManagedRoleRequest;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminAuditLogger;
use App\Services\Admin\AdminAuditTaxonomy;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

final class RoleController
{
    public function __construct(private readonly AdminAuditLogger $audit) {}

    public function index(): JsonResponse
    {
        $roles = Role::query()
            ->with('permissions')
            ->withCount('users')
            ->orderBy('slug')
            ->get()
            ->map(fn (Role $role): array => $this->rolePayload($role));

        return response()->json(['roles' => $roles]);
    }

    public function permissions(): JsonResponse
    {
        return response()->json([
            'permissions' => Permission::query()
                ->orderBy('category')
                ->orderBy('slug')
                ->get()
                ->map(fn (Permission $permission): array => $permission->only(['slug', 'name', 'description', 'category']))
                ->values(),
        ]);
    }

    public function store(StoreManagedRoleRequest $request, CreateManagedRoleAction $action): JsonResponse
    {
        return $this->runMutation(
            $request,
            'create_managed_role',
            ['role_slug' => $request->validated('slug')],
            fn (): array => ['role' => $this->rolePayload($action->execute($request->validated()))],
            201,
        );
    }

    public function update(UpdateManagedRoleRequest $request, UpdateManagedRoleAction $action, string $role): JsonResponse
    {
        return $this->mutateRole(
            $request,
            $role,
            'update_managed_role',
            fn (Role $target): Role => $action->execute($target, $request->validated()),
        );
    }

    public function destroy(Request $request, DeleteManagedRoleAction $action, string $role): JsonResponse
    {
        $target = $this->findRole($role);

        if (! $target instanceof Role) {
            return response()->json(['error' => 'Role not found.'], 404);
        }

        return $this->runMutation(
            $request,
            'delete_managed_role',
            ['role_slug' => $target->slug],
            function () use ($action, $target): array {
                $action->execute($target);

                return ['deleted' => true, 'role_slug' => $target->slug];
            },
        );
    }

    public function syncPermissions(
        SyncRolePermissionsRequest $request,
        SyncRolePermissionsAction $action,
        string $role,
    ): JsonResponse {
        return $this->mutateRole(
            $request,
            $role,
            'sync_role_permissions',
            fn (Role $target): Role => $action->execute($target, $request->validated('permission_slugs')),
            ['permission_slugs' => $request->validated('permission_slugs')],
        );
    }

    public function syncUserRoles(
        SyncUserRolesRequest $request,
        SyncUserRolesAction $action,
        string $subjectId,
    ): JsonResponse {
        $target = User::query()->where('subject_id', $subjectId)->first();

        if (! $target instanceof User) {
            return response()->json(['error' => 'User not found.'], 404);
        }

        return $this->runMutation(
            $request,
            'sync_user_roles',
            ['target_subject_id' => $subjectId, 'role_slugs' => $request->validated('role_slugs')],
            fn (): array => ['user' => $this->userRolePayload($action->execute($target, $request->validated('role_slugs')))],
        );
    }

    private function findRole(string $role): ?Role
    {
        return Role::query()->where('slug', $role)->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function rolePayload(Role $role): array
    {
        $role->loadMissing('permissions');

        return [
            ...$role->only(['id', 'slug', 'name', 'description', 'is_system']),
            'permissions' => $role->permissions
                ->map(fn (Permission $permission): array => $permission->only(['slug', 'name', 'category']))
                ->sortBy('slug')
                ->values()
                ->all(),
            'users_count' => (int) ($role->users_count ?? $role->users()->count()),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function userRolePayload(User $user): array
    {
        $user->loadMissing('roles');

        return [
            ...$user->only(['subject_id', 'email', 'display_name', 'role', 'status']),
            'roles' => $user->roles
                ->map(fn (Role $role): array => $role->only(['slug', 'name', 'is_system']))
                ->sortBy('slug')
                ->values()
                ->all(),
        ];
    }

    /**
     * @param  Closure(): array<string, mixed>  $callback
     */
    private function runMutation(Request $request, string $action, array $context, Closure $callback, int $status = 200): JsonResponse
    {
        /** @var User $admin */
        $admin = $request->attributes->get('admin_user');

        try {
            $result = $callback();
        } catch (Throwable $exception) {
            $this->audit->failed($action, $request, $admin, $exception, $context, AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);

            return response()->json(['error' => 'Role management action failed.'], 422);
        }

        $this->audit->succeeded($action, $request, $admin, $context, AdminAuditTaxonomy::DESTRUCTIVE_ACTION_WITH_STEP_UP);

        return response()->json($result, $status);
    }

    /**
     * @param  Closure(Role): Role  $callback
     */
    private function mutateRole(Request $request, string $role, string $action, Closure $callback, array $context = []): JsonResponse
    {
        $target = $this->findRole($role);

        if (! $target instanceof Role) {
            return response()->json(['error' => 'Role not found.'], 404);
        }

        return $this->runMutation(
            $request,
            $action,
            ['role_slug' => $target->slug, ...$context],
            fn (): array => ['role' => $this->rolePayload($callback($target))],
        );
    }
}

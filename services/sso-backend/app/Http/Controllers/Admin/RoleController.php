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
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminMutationResponder;
use App\Services\Admin\AdminRolePresenter;
use App\Services\Admin\AdminRoleQuery;
use App\Support\Responses\AdminApiResponse;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class RoleController
{
    public function __construct(
        private readonly AdminRoleQuery $roles,
        private readonly AdminRolePresenter $presenter,
        private readonly AdminMutationResponder $mutations,
    ) {}

    public function index(): JsonResponse
    {
        return AdminApiResponse::ok(['roles' => $this->roles->roles()]);
    }

    public function permissions(): JsonResponse
    {
        return AdminApiResponse::ok(['permissions' => $this->roles->permissions()]);
    }

    public function store(StoreManagedRoleRequest $request, CreateManagedRoleAction $action): JsonResponse
    {
        return $this->mutate($request, 'create_managed_role', ['role_slug' => $request->validated('slug')], fn (): array => ['role' => $this->presenter->role($action->execute($request->validated()))], 201);
    }

    public function update(UpdateManagedRoleRequest $request, UpdateManagedRoleAction $action, string $role): JsonResponse
    {
        return $this->mutateRole($request, $role, 'update_managed_role', fn (Role $target): Role => $action->execute($target, $request->validated()));
    }

    public function destroy(Request $request, DeleteManagedRoleAction $action, string $role): JsonResponse
    {
        $target = $this->roles->findRole($role);

        return $target instanceof Role
            ? $this->mutate($request, 'delete_managed_role', ['role_slug' => $target->slug], function () use ($action, $target): array {
                $action->execute($target);

                return ['deleted' => true, 'role_slug' => $target->slug];
            })
            : AdminApiResponse::error('not_found', 'Role not found.', 404);
    }

    public function syncPermissions(SyncRolePermissionsRequest $request, SyncRolePermissionsAction $action, string $role): JsonResponse
    {
        return $this->mutateRole($request, $role, 'sync_role_permissions', fn (Role $target): Role => $action->execute($target, $request->validated('permission_slugs')), ['permission_slugs' => $request->validated('permission_slugs')]);
    }

    public function syncUserRoles(SyncUserRolesRequest $request, SyncUserRolesAction $action, string $subjectId): JsonResponse
    {
        $target = $this->roles->findUser($subjectId);

        return $target instanceof User
            ? $this->mutate($request, 'sync_user_roles', ['target_subject_id' => $subjectId, 'role_slugs' => $request->validated('role_slugs')], fn (): array => ['user' => $this->presenter->userRole($action->execute($target, $request->validated('role_slugs')))])
            : AdminApiResponse::error('not_found', 'User not found.', 404);
    }

    /** @param Closure(): array<string, mixed> $callback */
    private function mutate(Request $request, string $action, array $context, Closure $callback, int $status = 200): JsonResponse
    {
        return $this->mutations->run($request, $action, $context, $callback, 'Role management action failed.', $status);
    }

    /** @param Closure(Role): Role $callback */
    private function mutateRole(Request $request, string $role, string $action, Closure $callback, array $context = []): JsonResponse
    {
        $target = $this->roles->findRole($role);

        return $target instanceof Role
            ? $this->mutate($request, $action, ['role_slug' => $target->slug, ...$context], fn (): array => ['role' => $this->presenter->role($callback($target))])
            : AdminApiResponse::error('not_found', 'Role not found.', 404);
    }
}

<?php

declare(strict_types=1);

use App\Support\Rbac\AdminPermission;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $this->upsertPermissions($now);
        $this->upsertRoles($now);
        $this->syncBaselineRolePermissions();
        $this->backfillUserRolePivot($now);
    }

    public function down(): void
    {
        // Data migration only. Keep roles, permissions, and assignments intact on rollback.
    }

    private function upsertPermissions(DateTimeInterface $now): void
    {
        $rows = collect(AdminPermission::all())
            ->map(fn (string $slug): array => [
                'slug' => $slug,
                'name' => str($slug)->replace('.', ' ')->title()->toString(),
                'description' => "Allows {$slug} capability.",
                'category' => str($slug)->before('.')->toString(),
                'created_at' => $now,
                'updated_at' => $now,
            ])
            ->all();

        DB::table('permissions')->upsert(
            $rows,
            ['slug'],
            ['name', 'description', 'category', 'updated_at'],
        );
    }

    private function upsertRoles(DateTimeInterface $now): void
    {
        $rows = collect($this->roleCatalog())
            ->map(fn (array $role): array => [
                'slug' => $role['slug'],
                'name' => $role['name'],
                'description' => $role['description'],
                'is_system' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ])
            ->all();

        DB::table('roles')->upsert(
            $rows,
            ['slug'],
            ['name', 'description', 'is_system', 'updated_at'],
        );
    }

    private function syncBaselineRolePermissions(): void
    {
        $permissionIds = DB::table('permissions')->pluck('id', 'slug');
        $roleIds = DB::table('roles')->pluck('id', 'slug');
        $now = now();

        $rows = [];

        foreach ($this->rolePermissionCatalog() as $roleSlug => $permissionSlugs) {
            $roleId = $roleIds[$roleSlug] ?? null;

            if ($roleId === null) {
                continue;
            }

            foreach ($permissionSlugs as $permissionSlug) {
                $permissionId = $permissionIds[$permissionSlug] ?? null;

                if ($permissionId !== null) {
                    $rows[] = [
                        'permission_id' => $permissionId,
                        'role_id' => $roleId,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                }
            }
        }

        if ($rows !== []) {
            DB::table('permission_role')->insertOrIgnore($rows);
        }
    }

    private function backfillUserRolePivot(DateTimeInterface $now): void
    {
        DB::table('users')
            ->join('roles', 'roles.slug', '=', 'users.role')
            ->select(['users.id as user_id', 'roles.id as role_id'])
            ->orderBy('users.id')
            ->chunk(500, function ($users) use ($now): void {
                $rows = $users
                    ->map(fn (object $user): array => [
                        'role_id' => $user->role_id,
                        'user_id' => $user->user_id,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ])
                    ->all();

                if ($rows !== []) {
                    DB::table('role_user')->insertOrIgnore($rows);
                }
            });
    }

    /**
     * @return list<array{slug: string, name: string, description: string}>
     */
    private function roleCatalog(): array
    {
        return [
            ['slug' => 'admin', 'name' => 'Administrator', 'description' => 'Full SSO administration role.'],
            ['slug' => 'user', 'name' => 'User', 'description' => 'Default least-privilege user role.'],
            ['slug' => 'auditor', 'name' => 'Auditor', 'description' => 'Read-only auditor with audit export rights.'],
            ['slug' => 'support', 'name' => 'Support', 'description' => 'Support staff with read-only user/session/audit visibility.'],
            ['slug' => 'client-manager', 'name' => 'Client Manager', 'description' => 'Manages OIDC clients and external IdPs.'],
            ['slug' => 'security-officer', 'name' => 'Security Officer', 'description' => 'Incident responder with session termination, user lock, and DSR review.'],
        ];
    }

    /**
     * @return array<string, list<string>>
     */
    private function rolePermissionCatalog(): array
    {
        return [
            'admin' => AdminPermission::adminDefaults(),
            'user' => AdminPermission::userDefaults(),
            ...AdminPermission::leastPrivilegeRoleCatalog(),
        ];
    }
};

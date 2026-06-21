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

        DB::table('permissions')->upsert([
            [
                'slug' => AdminPermission::OBSERVABILITY_READ,
                'name' => 'Admin Observability Read',
                'description' => 'Allows read-only access to SSO observability telemetry summaries.',
                'category' => 'admin',
                'created_at' => $now,
                'updated_at' => $now,
            ],
        ], ['slug'], ['name', 'description', 'category', 'updated_at']);

        $permissionId = DB::table('permissions')
            ->where('slug', AdminPermission::OBSERVABILITY_READ)
            ->value('id');

        if ($permissionId === null) {
            return;
        }

        $roleIds = DB::table('roles')
            ->whereIn('slug', ['admin', 'auditor', 'security-officer'])
            ->pluck('id')
            ->all();

        $rows = array_map(
            static fn (int|string $roleId): array => [
                'permission_id' => $permissionId,
                'role_id' => $roleId,
                'created_at' => $now,
                'updated_at' => $now,
            ],
            $roleIds,
        );

        if ($rows !== []) {
            DB::table('permission_role')->insertOrIgnore($rows);
        }
    }

    public function down(): void
    {
        // Data migration only. Keep permission assignments intact on rollback.
    }
};

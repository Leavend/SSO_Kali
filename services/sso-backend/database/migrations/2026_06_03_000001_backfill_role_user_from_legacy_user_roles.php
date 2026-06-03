<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $now = now();

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

    public function down(): void
    {
        // Data backfill only. Keep role assignments intact on rollback.
    }
};

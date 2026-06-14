<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function (): void {
            $userRoles = DB::table('role_user')
                ->join('roles', 'roles.id', '=', 'role_user.role_id')
                ->select('role_user.user_id', 'roles.slug')
                ->orderByRaw("case roles.slug when 'admin' then 0 else 1 end")
                ->orderBy('roles.slug')
                ->get()
                ->groupBy('user_id');

            foreach ($userRoles as $userId => $rows) {
                $primary = $rows->first();
                if ($primary === null) {
                    continue;
                }

                DB::table('users')->where('id', $userId)->update(['role' => $primary->slug]);
                DB::table('role_user')->where('user_id', $userId)->delete();
                DB::table('role_user')->insert([
                    'user_id' => $userId,
                    'role_id' => DB::table('roles')->where('slug', $primary->slug)->value('id'),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        });

        Schema::table('role_user', function (Blueprint $table): void {
            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        // WARNING: This rollback is LOSSY. The up() method collapsed multi-role users to single roles
        // and permanently deleted the extra pivot rows. Rolling back will NOT restore those deleted rows.
        // Data will remain in the single-role collapsed state.
        //
        // If you need to restore multi-role support, manually restore from backup or review the
        // up() method's deletion logic and implement selective restoration.
        Schema::table('role_user', function (Blueprint $table): void {
            $table->dropUnique(['user_id']);
        });
    }
};

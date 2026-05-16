<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('locked_at')->nullable()->after('disabled_reason');
            $table->timestamp('locked_until')->nullable()->after('locked_at');
            $table->string('locked_reason', 255)->nullable()->after('locked_until');
            $table->string('locked_by_subject_id', 64)->nullable()->after('locked_reason');
            $table->unsignedInteger('lock_count')->default(0)->after('locked_by_subject_id');
            $table->index(['locked_at', 'locked_until'], 'users_lock_window_idx');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_lock_window_idx');
            $table->dropColumn([
                'locked_at',
                'locked_until',
                'locked_reason',
                'locked_by_subject_id',
                'lock_count',
            ]);
        });
    }
};

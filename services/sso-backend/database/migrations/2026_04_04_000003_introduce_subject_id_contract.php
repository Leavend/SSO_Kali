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
        $this->migrateUsers();
        $this->migrateLoginContexts();
        $this->migrateRefreshTokenRotations();
    }

    public function down(): void
    {
        $this->dropUsersSubjectId();
        $this->dropIndexedSubjectId('login_contexts');
        $this->dropIndexedSubjectId('refresh_token_rotations');
    }

    private function migrateUsers(): void
    {
        if (! Schema::hasColumn('users', 'subject_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->string('subject_id')->nullable()->unique();
            });
        }

        $this->backfillSubjectId('users');
    }

    private function migrateLoginContexts(): void
    {
        $this->ensureIndexedSubjectId('login_contexts');
        $this->backfillSubjectId('login_contexts');
    }

    private function migrateRefreshTokenRotations(): void
    {
        $this->ensureIndexedSubjectId('refresh_token_rotations');
        $this->backfillSubjectId('refresh_token_rotations');
    }

    private function ensureIndexedSubjectId(string $table): void
    {
        if (Schema::hasColumn($table, 'subject_id')) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint): void {
            $blueprint->string('subject_id')->nullable()->index();
        });
    }

    private function backfillSubjectId(string $table): void
    {
        if (! Schema::hasColumn($table, 'subject_uuid') || ! Schema::hasColumn($table, 'subject_id')) {
            return;
        }

        DB::table($table)
            ->select(['id', 'subject_uuid'])
            ->whereNull('subject_id')
            ->orderBy('id')
            ->lazyById()
            ->each(fn (object $row): int => DB::table($table)
                ->where('id', $row->id)
                ->update(['subject_id' => $row->subject_uuid]));
    }

    private function dropUsersSubjectId(): void
    {
        if (! Schema::hasColumn('users', 'subject_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique('users_subject_id_unique');
            $table->dropColumn('subject_id');
        });
    }

    private function dropIndexedSubjectId(string $table): void
    {
        if (! Schema::hasColumn($table, 'subject_id')) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($table): void {
            $blueprint->dropIndex($table.'_subject_id_index');
            $blueprint->dropColumn('subject_id');
        });
    }
};

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
        $this->addCanonicalSubjectIdColumn();
        $this->backfillCanonicalSubjectId();
        $this->removeLegacyExternalSubjectColumn();
    }

    public function down(): void
    {
        $this->restoreLegacyExternalSubjectColumn();
        $this->backfillLegacyExternalSubject();
        $this->removeCanonicalSubjectIdColumn();
    }

    private function addCanonicalSubjectIdColumn(): void
    {
        if (Schema::hasColumn('users', 'subject_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->string('subject_id')->nullable()->unique();
        });
    }

    private function backfillCanonicalSubjectId(): void
    {
        if (! Schema::hasColumn('users', 'subject_id') || ! Schema::hasColumn('users', 'external_subject')) {
            return;
        }

        DB::table('users')
            ->select(['id', 'external_subject'])
            ->whereNull('subject_id')
            ->orderBy('id')
            ->each(fn (object $row): int => DB::table('users')
                ->where('id', $row->id)
                ->update(['subject_id' => (string) $row->external_subject]));
    }

    private function removeLegacyExternalSubjectColumn(): void
    {
        if (! Schema::hasColumn('users', 'external_subject')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique('users_external_subject_unique');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('external_subject');
        });
    }

    private function restoreLegacyExternalSubjectColumn(): void
    {
        if (Schema::hasColumn('users', 'external_subject')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->string('external_subject')->nullable()->unique();
        });
    }

    private function backfillLegacyExternalSubject(): void
    {
        if (! Schema::hasColumn('users', 'subject_id') || ! Schema::hasColumn('users', 'external_subject')) {
            return;
        }

        DB::table('users')
            ->select(['id', 'subject_id'])
            ->whereNull('external_subject')
            ->orderBy('id')
            ->each(fn (object $row): int => DB::table('users')
                ->where('id', $row->id)
                ->update(['external_subject' => (string) $row->subject_id]));
    }

    private function removeCanonicalSubjectIdColumn(): void
    {
        if (! Schema::hasColumn('users', 'subject_id')) {
            return;
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique('users_subject_id_unique');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('subject_id');
        });
    }
};

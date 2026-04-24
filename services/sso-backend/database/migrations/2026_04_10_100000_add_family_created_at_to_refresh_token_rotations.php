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
        Schema::table('refresh_token_rotations', function (Blueprint $table): void {
            $table->timestamp('family_created_at')->nullable()->after('token_family_id');
        });

        $this->backfillFamilyCreatedAt();

        Schema::table('refresh_token_rotations', function (Blueprint $table): void {
            $table->index(
                ['token_family_id', 'family_created_at'],
                'refresh_token_family_created_at_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::table('refresh_token_rotations', function (Blueprint $table): void {
            $table->dropIndex('refresh_token_family_created_at_idx');
            $table->dropColumn('family_created_at');
        });
    }

    private function backfillFamilyCreatedAt(): void
    {
        DB::table('refresh_token_rotations')
            ->select(['id', 'created_at'])
            ->whereNull('family_created_at')
            ->orderBy('id')
            ->chunkById(100, function ($rows): void {
                foreach ($rows as $row) {
                    $this->updateRow((int) $row->id, $row->created_at);
                }
            });
    }

    private function updateRow(int $id, mixed $createdAt): void
    {
        DB::table('refresh_token_rotations')
            ->where('id', $id)
            ->update([
                'family_created_at' => $createdAt ?? now(),
                'updated_at' => now(),
            ]);
    }
};

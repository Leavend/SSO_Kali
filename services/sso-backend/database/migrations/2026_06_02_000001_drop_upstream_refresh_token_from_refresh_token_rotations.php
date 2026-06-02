<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('refresh_token_rotations', 'upstream_refresh_token')) {
            return;
        }

        Schema::table('refresh_token_rotations', function (Blueprint $table): void {
            $table->dropColumn('upstream_refresh_token');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('refresh_token_rotations', 'upstream_refresh_token')) {
            return;
        }

        Schema::table('refresh_token_rotations', function (Blueprint $table): void {
            $table->text('upstream_refresh_token')->nullable()->after('session_id');
        });
    }
};

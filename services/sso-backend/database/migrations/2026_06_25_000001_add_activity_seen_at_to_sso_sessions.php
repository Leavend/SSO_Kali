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
        Schema::table('sso_sessions', function (Blueprint $table): void {
            $table->timestamp('activity_seen_at')->nullable()->after('last_seen_at')->index();
        });

        DB::table('sso_sessions')->update([
            'activity_seen_at' => DB::raw('COALESCE(last_seen_at, authenticated_at)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('sso_sessions', function (Blueprint $table): void {
            $table->dropColumn('activity_seen_at');
        });
    }
};

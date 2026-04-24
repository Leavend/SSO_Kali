<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('login_contexts', function (Blueprint $table): void {
            $table->timestamp('auth_time')->nullable()->after('mfa_required');
            $table->json('amr')->nullable()->after('auth_time');
            $table->string('acr')->nullable()->after('amr');
        });

        Schema::table('refresh_token_rotations', function (Blueprint $table): void {
            $table->timestamp('auth_time')->nullable()->after('session_id');
            $table->json('amr')->nullable()->after('auth_time');
            $table->string('acr')->nullable()->after('amr');
        });
    }

    public function down(): void
    {
        Schema::table('refresh_token_rotations', function (Blueprint $table): void {
            $table->dropColumn(['auth_time', 'amr', 'acr']);
        });

        Schema::table('login_contexts', function (Blueprint $table): void {
            $table->dropColumn(['auth_time', 'amr', 'acr']);
        });
    }
};

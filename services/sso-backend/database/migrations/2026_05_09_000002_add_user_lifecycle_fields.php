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
            $table->string('status')->default('active')->index()->after('role');
            $table->timestamp('disabled_at')->nullable()->after('status');
            $table->string('disabled_reason')->nullable()->after('disabled_at');
            $table->boolean('local_account_enabled')->default(false)->after('disabled_reason');
            $table->timestamp('profile_synced_at')->nullable()->after('local_account_enabled');
            $table->string('password_reset_token_hash')->nullable()->after('profile_synced_at');
            $table->timestamp('password_reset_token_expires_at')->nullable()->after('password_reset_token_hash');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'status',
                'disabled_at',
                'disabled_reason',
                'local_account_enabled',
                'profile_synced_at',
                'password_reset_token_hash',
                'password_reset_token_expires_at',
            ]);
        });
    }
};

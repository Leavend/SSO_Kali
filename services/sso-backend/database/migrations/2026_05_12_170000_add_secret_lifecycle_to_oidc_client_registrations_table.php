<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FR-009 client secret lifecycle — track when each confidential client's
 * secret was last rotated and when it should be considered expired. Both
 * columns are nullable so existing rows remain valid until their first
 * rotation; a follow-up housekeeping task can backfill from created_at.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->timestamp('secret_rotated_at')->nullable()->after('secret_hash');
            $table->timestamp('secret_expires_at')->nullable()->after('secret_rotated_at');
        });
    }

    public function down(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->dropColumn(['secret_rotated_at', 'secret_expires_at']);
        });
    }
};

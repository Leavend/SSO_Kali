<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FR-012 / ISSUE-01 + ISSUE-03: Add decommissioned_at and disabled_reason
 * to support true decommission status and suspension notes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->string('disabled_reason')->nullable()->after('disabled_at');
            $table->timestamp('decommissioned_at')->nullable()->after('disabled_reason');
        });
    }

    public function down(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->dropColumn(['disabled_reason', 'decommissioned_at']);
        });
    }
};

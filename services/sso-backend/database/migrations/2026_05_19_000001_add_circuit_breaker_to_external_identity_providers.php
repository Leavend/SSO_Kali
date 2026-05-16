<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * BE-FR059-001 — circuit breaker counters for external IdP failover.
 *
 * Tracks consecutive failure counts and automatic-disable timestamps so the
 * scheduled probe (`sso:external-idp:probe-health`) can trip a flapping
 * provider into `unhealthy` state and the failover policy can prefer a
 * backup until the breaker is reset by a successful probe.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('external_identity_providers', function (Blueprint $table): void {
            $table->unsignedInteger('consecutive_failures')->default(0);
            $table->unsignedInteger('consecutive_successes')->default(0);
            $table->timestamp('breaker_tripped_at')->nullable();
            $table->string('breaker_reason')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('external_identity_providers', function (Blueprint $table): void {
            $table->dropColumn([
                'consecutive_failures',
                'consecutive_successes',
                'breaker_tripped_at',
                'breaker_reason',
            ]);
        });
    }
};

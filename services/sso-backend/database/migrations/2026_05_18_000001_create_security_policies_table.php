<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FR-055 / BE-FR055-001 — Security policy aggregate.
 *
 * Versioned, audited rollout of password/MFA/session/lockout policies so
 * operators can propose, activate, or rollback without redeploying. Each
 * row is a snapshot for a given (category, version). Exactly one row per
 * category may be `status = active`; runtime readers cache it and fall
 * back to env-only defaults when no active version exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_policies', function (Blueprint $table): void {
            $table->id();
            $table->string('category', 64);
            $table->unsignedInteger('version');
            $table->string('status', 16)->default('draft');
            $table->json('payload');
            $table->timestamp('effective_at')->nullable();
            $table->string('actor_subject_id', 64)->nullable();
            $table->string('reason', 500)->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('superseded_at')->nullable();
            $table->timestamps();

            $table->unique(['category', 'version'], 'security_policies_category_version_unique');
            $table->index(['category', 'status'], 'security_policies_category_status_idx');
            $table->index(['actor_subject_id'], 'security_policies_actor_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_policies');
    }
};

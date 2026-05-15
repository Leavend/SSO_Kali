<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * BE-FR020-001 — Lost-factor MFA recovery workflow.
 *
 * Tracks when an admin has performed an emergency MFA reset and forces the
 * user to re-enroll a second factor before any further privileged action.
 *
 * - mfa_reset_required: when true, all protected endpoints (except the MFA
 *   enrollment endpoints themselves) must respond with
 *   `mfa_reenrollment_required` until the user completes a fresh enrollment.
 * - mfa_reset_at: timestamp of the most recent reset (audit + UX banner).
 * - mfa_reset_reason: redacted reason captured by the admin at reset time.
 * - mfa_reset_by_user_id: numeric id of the requesting admin (FK; SET NULL
 *   on delete to keep audit immutability).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('mfa_reset_required')->default(false)->after('password_changed_at');
            $table->timestamp('mfa_reset_at')->nullable()->after('mfa_reset_required');
            $table->string('mfa_reset_reason', 240)->nullable()->after('mfa_reset_at');
            $table->foreignId('mfa_reset_by_user_id')
                ->nullable()
                ->after('mfa_reset_reason')
                ->constrained('users')
                ->nullOnDelete();

            $table->index('mfa_reset_required', 'users_mfa_reset_required_index');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_mfa_reset_required_index');
            $table->dropConstrainedForeignId('mfa_reset_by_user_id');
            $table->dropColumn(['mfa_reset_required', 'mfa_reset_at', 'mfa_reset_reason']);
        });
    }
};

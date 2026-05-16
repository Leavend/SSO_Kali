<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * BE-FR040-001 — Persistent RP Session Registry.
 *
 * Promotes the relying-party session registry from cache-only
 * (`oidc:backchannel-session:{sid}`) to a durable
 * `oidc_rp_sessions` table keyed by `(sid, client_id)`.
 *
 * Cache stays as an acceleration layer (read-through write-through);
 * this table is the source of truth so:
 *
 * - Cache eviction never silently loses RP back-channel logout
 *   targets (FR-040 / UC-44, UC-46).
 * - Public clients without refresh tokens (PKCE-only) appear in
 *   profile / admin session lists alongside refresh-token-bound
 *   sessions.
 * - Front-channel-only RPs are addressable for FR-043 fallbacks
 *   via the `channels` column.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oidc_rp_sessions', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('sid', 191);
            $table->string('client_id', 191);
            $table->string('subject_id', 191)->nullable();
            $table->text('backchannel_logout_uri')->nullable();
            $table->text('frontchannel_logout_uri')->nullable();
            $table->string('channels', 32)->default('backchannel');
            $table->string('scope', 1024)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('last_seen_at')->useCurrent();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();

            $table->unique(['sid', 'client_id'], 'oidc_rp_sessions_sid_client_unique');
            $table->index('subject_id', 'oidc_rp_sessions_subject_idx');
            $table->index('client_id', 'oidc_rp_sessions_client_idx');
            $table->index(['sid', 'revoked_at'], 'oidc_rp_sessions_sid_active_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oidc_rp_sessions');
    }
};

<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * BE-FR043-001 — Front-Channel Logout fallback registration.
 *
 * OIDC Front-Channel Logout 1.0 §2 requires `frontchannel_logout_uri`
 * to be registrable per RP and `frontchannel_logout_session_required`
 * to flag whether the OP must include `iss`/`sid` query params on the
 * iframe URL. Until this migration, only `backchannel_logout_uri` is
 * persisted, so RPs that exclusively support FCL fall through global
 * logout without ever being notified — the High-severity gap captured
 * in `docs/audits/fr-029-fr-063-gap-audit.md` §BE-FR043-001.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->string('frontchannel_logout_uri', 500)
                ->nullable()
                ->after('backchannel_logout_uri');
            $table->boolean('frontchannel_logout_session_required')
                ->default(true)
                ->after('frontchannel_logout_uri');
        });
    }

    public function down(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->dropColumn(['frontchannel_logout_uri', 'frontchannel_logout_session_required']);
        });
    }
};

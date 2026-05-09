<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->json('allowed_scopes')->nullable()->after('post_logout_redirect_uris');
        });
    }

    public function down(): void
    {
        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->dropColumn('allowed_scopes');
        });
    }
};

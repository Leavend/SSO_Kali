<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('external_identity_providers', function (Blueprint $table): void {
            $table->id();
            $table->string('provider_key')->unique();
            $table->string('display_name');
            $table->string('issuer')->unique();
            $table->string('metadata_url')->unique();
            $table->string('client_id');
            $table->text('client_secret_encrypted')->nullable();
            $table->string('authorization_endpoint')->nullable();
            $table->string('token_endpoint')->nullable();
            $table->string('userinfo_endpoint')->nullable();
            $table->string('jwks_uri')->nullable();
            $table->json('allowed_algorithms');
            $table->json('scopes');
            $table->unsignedInteger('priority')->default(100);
            $table->boolean('enabled')->default(false)->index();
            $table->boolean('is_backup')->default(false)->index();
            $table->boolean('tls_validation_enabled')->default(true);
            $table->boolean('signature_validation_enabled')->default(true);
            $table->string('created_by_subject_id')->nullable();
            $table->string('updated_by_subject_id')->nullable();
            $table->timestamp('last_discovered_at')->nullable();
            $table->timestamp('last_health_checked_at')->nullable();
            $table->string('health_status')->default('unknown')->index();
            $table->timestamps();

            $table->index(['enabled', 'priority']);
            $table->index(['is_backup', 'priority']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_identity_providers');
    }
};

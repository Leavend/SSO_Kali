<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('external_subject_links', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('external_identity_provider_id')
                ->constrained('external_identity_providers')
                ->cascadeOnDelete();
            $table->string('provider_key');
            $table->string('issuer');
            $table->string('external_subject');
            $table->string('email')->nullable();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('display_name')->nullable();
            $table->json('last_claims_snapshot')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();

            $table->unique(['provider_key', 'external_subject']);
            $table->unique(['external_identity_provider_id', 'external_subject'], 'ext_subject_links_provider_subject_unique');
            $table->index(['user_id', 'provider_key']);
            $table->index('email');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_subject_links');
    }
};

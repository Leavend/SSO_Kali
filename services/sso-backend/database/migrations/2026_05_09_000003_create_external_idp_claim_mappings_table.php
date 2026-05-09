<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('external_idp_claim_mappings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('external_identity_provider_id')
                ->constrained('external_identity_providers')
                ->cascadeOnDelete();
            $table->string('provider_key')->index();
            $table->json('subject_paths');
            $table->json('email_paths');
            $table->json('name_paths');
            $table->json('username_paths');
            $table->json('required_paths');
            $table->boolean('require_verified_email')->default(true);
            $table->boolean('enabled')->default(true)->index();
            $table->string('created_by_subject_id')->nullable();
            $table->string('updated_by_subject_id')->nullable();
            $table->timestamps();

            $table->unique('external_identity_provider_id');
            $table->index(['provider_key', 'enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('external_idp_claim_mappings');
    }
};

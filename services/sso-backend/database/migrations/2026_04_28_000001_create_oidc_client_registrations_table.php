<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oidc_client_registrations', function (Blueprint $table): void {
            $table->id();
            $table->string('client_id', 63)->unique();
            $table->string('display_name');
            $table->string('type', 16);
            $table->string('environment', 16);
            $table->string('app_base_url');
            $table->json('redirect_uris');
            $table->json('post_logout_redirect_uris');
            $table->string('backchannel_logout_uri')->nullable();
            $table->text('secret_hash')->nullable();
            $table->string('owner_email');
            $table->string('provisioning', 16);
            $table->json('contract');
            $table->string('status', 16)->index();
            $table->string('staged_by_subject_id')->nullable();
            $table->string('staged_by_email')->nullable();
            $table->string('activated_by_subject_id')->nullable();
            $table->string('activated_by_email')->nullable();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('disabled_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'client_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oidc_client_registrations');
    }
};

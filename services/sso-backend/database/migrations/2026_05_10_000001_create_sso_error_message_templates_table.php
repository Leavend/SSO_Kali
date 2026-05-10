<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sso_error_message_templates', function (Blueprint $table): void {
            $table->id();
            $table->string('error_code', 64);
            $table->string('locale', 8)->default('id');
            $table->string('title', 120);
            $table->string('message', 500);
            $table->string('action_label', 80);
            $table->string('action_url', 500)->nullable();
            $table->boolean('retry_allowed')->default(false);
            $table->boolean('alternative_login_allowed')->default(false);
            $table->boolean('is_enabled')->default(true);
            $table->string('created_by', 128)->nullable();
            $table->string('updated_by', 128)->nullable();
            $table->timestamps();

            $table->unique(['error_code', 'locale'], 'sso_error_templates_code_locale_unique');
            $table->index(['is_enabled', 'locale'], 'sso_error_templates_enabled_locale_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sso_error_message_templates');
    }
};

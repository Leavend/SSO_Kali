<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createUsersTable();
        $this->createLoginContextsTable();
        $this->createRefreshTokenRotationsTable();
        $this->createSessionsTable();
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('refresh_token_rotations');
        Schema::dropIfExists('login_contexts');
        Schema::dropIfExists('users');
    }

    private function createUsersTable(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_id')->unique();
            $table->string('subject_uuid')->nullable()->unique();
            $table->string('email')->unique();
            $table->string('given_name')->nullable();
            $table->string('family_name')->nullable();
            $table->string('display_name');
            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
        });
    }

    private function createLoginContextsTable(): void
    {
        Schema::create('login_contexts', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_id')->index();
            $table->string('subject_uuid')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->string('device_fingerprint')->nullable();
            $table->unsignedTinyInteger('risk_score')->default(0);
            $table->boolean('mfa_required')->default(false);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });
    }

    private function createRefreshTokenRotationsTable(): void
    {
        Schema::create('refresh_token_rotations', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_id')->index();
            $table->string('subject_uuid')->nullable()->index();
            $table->string('client_id');
            $table->string('refresh_token_id')->unique();
            $table->string('token_family_id');
            $table->string('secret_hash');
            $table->string('scope');
            $table->string('session_id');
            $table->text('upstream_refresh_token')->nullable();
            $table->timestamp('expires_at');
            $table->string('replaced_by_token_id')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();
        });
    }

    private function createSessionsTable(): void
    {
        Schema::create('sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }
};

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
        $this->createAuthTransactionsTable();
        $this->createSessionsTable();
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('auth_transactions');
        Schema::dropIfExists('users');
    }

    private function createUsersTable(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_id')->unique();
            $table->string('email')->unique();
            $table->string('display_name');
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();
        });
    }

    private function createAuthTransactionsTable(): void
    {
        Schema::create('auth_transactions', function (Blueprint $table): void {
            $table->id();
            $table->string('state')->unique();
            $table->string('nonce')->nullable();
            $table->string('redirect_uri');
            $table->timestamp('completed_at')->nullable();
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

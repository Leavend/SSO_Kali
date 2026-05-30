<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('trusted_devices', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('subject_id')->index();
            $table->string('fingerprint', 64);
            $table->string('label', 80)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamp('trusted_at');
            $table->timestamp('last_seen_at')->nullable()->index();
            $table->timestamp('revoked_at')->nullable()->index();
            $table->timestamps();

            $table->unique(['subject_id', 'fingerprint']);
        });

        Schema::table('sso_sessions', function (Blueprint $table): void {
            $table->foreignId('trusted_device_id')
                ->nullable()
                ->after('user_agent')
                ->constrained('trusted_devices')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('sso_sessions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('trusted_device_id');
        });

        Schema::dropIfExists('trusted_devices');
    }
};

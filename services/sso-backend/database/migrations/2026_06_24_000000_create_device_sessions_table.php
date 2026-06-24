<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('device_sessions', function (Blueprint $table): void {
            $table->id();
            $table->string('device_hash', 64)->index();
            $table->string('session_id')->index();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('account_id', 64)->unique();
            $table->timestamp('added_at');
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['device_hash', 'session_id']);
            $table->index(['device_hash', 'last_seen_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_sessions');
    }
};

<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mfa_credentials', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('method', 20)->default('totp');
            $table->text('secret'); // Encrypted at application layer
            $table->string('algorithm', 10)->default('sha1');
            $table->unsignedTinyInteger('digits')->default(6);
            $table->unsignedTinyInteger('period')->default(30);
            $table->timestamp('verified_at')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'method']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfa_credentials');
    }
};

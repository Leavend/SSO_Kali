<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ip_access_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('cidr', 45);
            $table->string('mode', 8);
            $table->text('reason')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->string('actor_subject_id')->nullable();
            $table->timestamps();
            $table->index('mode');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ip_access_rules');
    }
};

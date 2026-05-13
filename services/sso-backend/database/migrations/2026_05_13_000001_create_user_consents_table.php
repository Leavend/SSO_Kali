<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * FR-011 / ISSUE-01: User consent persistence.
 *
 * Tracks which scopes a user has granted to each client.
 * One active consent per (subject_id, client_id) pair.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_consents', function (Blueprint $table): void {
            $table->id();
            $table->string('subject_id')->index();
            $table->string('client_id')->index();
            $table->json('scopes');
            $table->timestamp('granted_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->unique(['subject_id', 'client_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_consents');
    }
};

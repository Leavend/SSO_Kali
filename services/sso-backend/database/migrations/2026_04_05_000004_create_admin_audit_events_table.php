<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('admin_audit_events', function (Blueprint $table): void {
            $table->id();
            $table->string('event_id', 26)->unique();
            $table->string('action')->index();
            $table->string('outcome')->index();
            $table->string('admin_subject_id')->nullable()->index();
            $table->string('admin_email')->nullable();
            $table->string('admin_role')->nullable();
            $table->string('method', 16);
            $table->string('path');
            $table->string('ip_address', 45)->nullable();
            $table->string('reason')->nullable();
            $table->json('context')->nullable();
            $table->timestamp('occurred_at')->index();
            $table->string('previous_hash', 64)->nullable();
            $table->string('event_hash', 64);
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_audit_events');
    }
};

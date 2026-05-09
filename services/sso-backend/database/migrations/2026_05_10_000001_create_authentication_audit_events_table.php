<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('authentication_audit_events', function (Blueprint $table): void {
            $table->id();
            $table->string('event_id', 26)->unique();
            $table->string('event_type')->index();
            $table->string('outcome')->index();
            $table->string('subject_id')->nullable()->index();
            $table->string('email')->nullable()->index();
            $table->string('client_id')->nullable()->index();
            $table->string('session_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->string('error_code')->nullable();
            $table->string('request_id')->nullable()->index();
            $table->json('context')->nullable();
            $table->timestamp('occurred_at')->index();
            $table->timestamp('created_at')->nullable();

            $table->index(['event_type', 'outcome']);
            $table->index(['subject_id', 'occurred_at']);
            $table->index(['client_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('authentication_audit_events');
    }
};

<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('data_subject_requests', function (Blueprint $table): void {
            $table->id();
            $table->ulid('request_id')->unique();
            $table->string('subject_id', 64)->index();
            $table->string('type', 32);
            $table->string('status', 32)->default('submitted');
            $table->text('reason')->nullable();
            $table->json('context')->nullable();
            $table->string('reviewer_subject_id', 64)->nullable();
            $table->text('reviewer_notes')->nullable();
            $table->timestamp('submitted_at')->useCurrent();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->timestamp('sla_due_at')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->index(['type', 'status']);
            $table->index('sla_due_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('data_subject_requests');
    }
};

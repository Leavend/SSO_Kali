<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dsr_fulfillment_artifacts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('data_subject_request_id')
                ->constrained('data_subject_requests')
                ->cascadeOnDelete();
            $table->string('type', 32);
            $table->boolean('dry_run');
            $table->longText('payload');
            $table->string('hash', 64);
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();

            $table->index(['data_subject_request_id', 'dry_run'], 'dsr_artifacts_request_dry_run_idx');
            $table->index(['hash'], 'dsr_artifacts_hash_idx');
            $table->index(['expires_at'], 'dsr_artifacts_expires_at_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dsr_fulfillment_artifacts');
    }
};

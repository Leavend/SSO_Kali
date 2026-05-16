<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('admin_audit_events', function (Blueprint $table): void {
            $table->string('signing_key_id', 64)->nullable()->after('event_hash');
            $table->index('signing_key_id', 'admin_audit_events_signing_key_id_idx');
        });
    }

    public function down(): void
    {
        Schema::table('admin_audit_events', function (Blueprint $table): void {
            $table->dropIndex('admin_audit_events_signing_key_id_idx');
            $table->dropColumn('signing_key_id');
        });
    }
};

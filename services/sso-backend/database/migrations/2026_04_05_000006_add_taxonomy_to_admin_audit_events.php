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
            $table->string('taxonomy')->nullable()->after('outcome')->index();
        });
    }

    public function down(): void
    {
        Schema::table('admin_audit_events', function (Blueprint $table): void {
            $table->dropColumn('taxonomy');
        });
    }
};

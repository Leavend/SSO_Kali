<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('login_contexts', 'risk_score')) {
            return;
        }

        Schema::table('login_contexts', function (Blueprint $table): void {
            $table->dropColumn('risk_score');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('login_contexts', 'risk_score')) {
            return;
        }

        Schema::table('login_contexts', function (Blueprint $table): void {
            $table->unsignedTinyInteger('risk_score')->default(0)->after('device_fingerprint');
        });
    }
};

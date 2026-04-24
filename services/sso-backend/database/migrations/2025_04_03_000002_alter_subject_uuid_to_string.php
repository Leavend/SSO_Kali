<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        //
        // Legacy note:
        // Fresh installs now create the compatibility column as `string`
        // directly in the base schema. Existing environments are migrated
        // forward by the dedicated subject_id transition migration.
        //
    }

    public function down(): void
    {
        //
        // Intentionally left blank. Reverting to UUID columns is not safe
        // once opaque subject identifiers have been stored.
        //
    }
};

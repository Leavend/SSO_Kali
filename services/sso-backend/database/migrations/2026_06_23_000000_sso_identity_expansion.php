<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->text('nik')->nullable();
            $table->string('nik_hash')->nullable()->unique();
            $table->text('nip')->nullable();
            $table->string('nip_hash')->nullable()->unique();
            $table->text('nisn')->nullable();
            $table->string('nisn_hash')->nullable()->unique();
            $table->date('birth_date')->nullable();
        });

        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->string('category', 32)->default('publik');
        });

        DB::table('roles')->insertOrIgnore([
            'slug' => 'pegawai',
            'name' => 'Pegawai',
            'description' => 'Employee identity role with access to internal applications.',
            'is_system' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        if ($this->hasStoredIdentityData()) {
            throw new RuntimeException(
                'Refusing to rollback sso_identity_expansion because government identity columns contain data. Back up the data and run a manual forward migration before dropping PII identity columns.'
            );
        }

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['nik', 'nik_hash', 'nip', 'nip_hash', 'nisn', 'nisn_hash', 'birth_date']);
        });

        Schema::table('oidc_client_registrations', function (Blueprint $table): void {
            $table->dropColumn('category');
        });

        DB::table('roles')->where('slug', 'pegawai')->delete();
    }

    private function hasStoredIdentityData(): bool
    {
        if (! Schema::hasTable('users')) {
            return false;
        }

        $columns = ['nik', 'nik_hash', 'nip', 'nip_hash', 'nisn', 'nisn_hash', 'birth_date'];
        $existing = array_values(array_filter(
            $columns,
            static fn (string $column): bool => Schema::hasColumn('users', $column),
        ));

        if ($existing === []) {
            return false;
        }

        return DB::table('users')
            ->where(function ($query) use ($existing): void {
                foreach ($existing as $column) {
                    $query->orWhereNotNull($column);
                }
            })
            ->exists();
    }
};

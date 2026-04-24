<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

beforeEach(function (): void {
    Schema::dropIfExists('users');
});

it('backfills subject_id from legacy external_subject values', function (): void {
    createLegacyAppBUsersTable();

    DB::table('users')->insert([
        'external_subject' => '366923007014207492',
        'email' => 'ada@example.com',
        'display_name' => 'Ada Lovelace',
        'last_synced_at' => now(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    subjectIdMigration()->up();

    expect(DB::table('users')->value('subject_id'))->toBe('366923007014207492')
        ->and(Schema::hasColumn('users', 'external_subject'))->toBeFalse();
});

it('defines subject_id as an opaque string without uuid-only storage', function (): void {
    $migrations = readSubjectIdMigrationFiles();
    $application = readPhpFiles(app_path());

    expect($migrations)->not->toContain("uuid('subject_id')")
        ->and($migrations)->not->toContain('uuid("subject_id")')
        ->and($migrations)->not->toContain('$table->uuid(\'external_subject\')')
        ->and($migrations)->not->toContain('$table->uuid("external_subject")')
        ->and($application)->not->toContain('external_subject');
});

function createLegacyAppBUsersTable(): void
{
    Schema::create('users', function (Blueprint $table): void {
        $table->id();
        $table->string('external_subject')->unique();
        $table->string('email')->unique();
        $table->string('display_name');
        $table->timestamp('last_synced_at')->nullable();
        $table->timestamps();
    });
}

function subjectIdMigration(): object
{
    return require database_path('migrations/2026_04_04_000001_introduce_subject_id_contract.php');
}

function readSubjectIdMigrationFiles(): string
{
    return readPhpFiles(database_path('migrations'));
}

function readPhpFiles(string $path): string
{
    return collect(File::allFiles($path))
        ->map(fn (SplFileInfo $file): string => File::get($file->getRealPath()))
        ->implode("\n");
}

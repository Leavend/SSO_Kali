<?php

declare(strict_types=1);

require_once dirname(__DIR__, 2).'/Support/UnitOidcDatabase.php';

use App\Services\Oidc\UserProfileSynchronizer;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

use function Tests\Support\ensureOidcUnitTables;
use function Tests\Support\resetOidcUnitTables;

beforeEach(function (): void {
    Schema::dropIfExists('refresh_token_rotations');
    Schema::dropIfExists('login_contexts');
    Schema::dropIfExists('users');
});

it('backfills subject_id from legacy subject_uuid columns', function (): void {
    createLegacyIdentityTables();
    seedLegacyIdentityRows();

    legacySubjectIdMigration()->up();

    expect(DB::table('users')->value('subject_id'))->toBe('366923007014207492')
        ->and(DB::table('login_contexts')->value('subject_id'))->toBe('366923007014207492')
        ->and(DB::table('refresh_token_rotations')->value('subject_id'))->toBe('366923007014207492');
});

it('accepts opaque numeric subject ids without uuid parsing', function (): void {
    ensureOidcUnitTables();
    resetOidcUnitTables();

    $user = app(UserProfileSynchronizer::class)->sync(subjectClaims(), requestContext());

    expect($user->subject_id)->toBe('366923007014207492')
        ->and(DB::table('login_contexts')->value('subject_id'))->toBe('366923007014207492');
});

it('does not define subject_id as a uuid or parse it as one', function (): void {
    $migrations = readFiles(database_path('migrations'));
    $application = readFiles(app_path());

    expect($migrations)->not->toContain("uuid('subject_id')")
        ->and($migrations)->not->toContain('uuid("subject_id")')
        ->and($migrations)->not->toContain("foreignUuid('subject_id')")
        ->and($migrations)->not->toContain('foreignUuid("subject_id")')
        ->and($application)->not->toContain('Str::isUuid(')
        ->and($application)->not->toContain('Uuid::fromString(');
});

function createLegacyIdentityTables(): void
{
    Schema::create('users', function (Blueprint $table): void {
        $table->id();
        $table->string('subject_uuid')->unique();
        $table->string('email')->unique();
        $table->string('display_name');
        $table->string('role')->default('user');
        $table->timestamp('last_login_at')->nullable();
        $table->timestamps();
    });

    Schema::create('login_contexts', function (Blueprint $table): void {
        $table->id();
        $table->string('subject_uuid')->unique();
        $table->timestamps();
    });

    Schema::create('refresh_token_rotations', function (Blueprint $table): void {
        $table->id();
        $table->string('subject_uuid');
        $table->string('client_id');
        $table->string('refresh_token_id')->unique();
        $table->string('token_family_id');
        $table->string('secret_hash');
        $table->string('scope');
        $table->string('session_id');
        $table->timestamp('expires_at');
        $table->timestamps();
    });
}

function seedLegacyIdentityRows(): void
{
    DB::table('users')->insert([
        'subject_uuid' => '366923007014207492',
        'email' => 'ada@example.com',
        'display_name' => 'Ada Lovelace',
        'role' => 'admin',
        'last_login_at' => now(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    DB::table('login_contexts')->insert([
        'subject_uuid' => '366923007014207492',
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    DB::table('refresh_token_rotations')->insert([
        'subject_uuid' => '366923007014207492',
        'client_id' => 'prototype-app-a',
        'refresh_token_id' => 'refresh-1',
        'token_family_id' => 'family-1',
        'secret_hash' => 'hash',
        'scope' => 'openid',
        'session_id' => 'session-1',
        'expires_at' => now()->addDay(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

function legacySubjectIdMigration(): object
{
    return require database_path('migrations/2026_04_04_000003_introduce_subject_id_contract.php');
}

/**
 * @return array<string, mixed>
 */
function subjectClaims(): array
{
    return [
        'sub' => '366923007014207492',
        'email' => 'ada@example.com',
        'name' => 'Ada Lovelace',
        'email_verified' => true,
    ];
}

/**
 * @return array<string, mixed>
 */
function requestContext(): array
{
    return [
        'ip_address' => '127.0.0.1',
        'user_agent' => 'Pest',
        'device_fingerprint' => 'device-123',
    ];
}

function readFiles(string $path): string
{
    return collect(File::allFiles($path))
        ->map(fn (SplFileInfo $file): string => File::get($file->getRealPath()))
        ->implode("\n");
}

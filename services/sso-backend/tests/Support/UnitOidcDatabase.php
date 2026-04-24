<?php

declare(strict_types=1);

namespace Tests\Support;

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

function resetOidcUnitTables(): void
{
    ensureOidcUnitTables();

    DB::table('login_contexts')->delete();
    DB::table('refresh_token_rotations')->delete();
    DB::table('users')->delete();
}

function seedOidcUnitUser(string $subjectId): void
{
    DB::table('users')->insert([
        'subject_id' => $subjectId,
        'subject_uuid' => $subjectId,
        'email' => 'ada@example.com',
        'given_name' => 'Ada',
        'family_name' => 'Lovelace',
        'display_name' => 'Ada Lovelace',
        'role' => 'user',
        'email_verified_at' => now(),
        'last_login_at' => now(),
        'created_at' => now(),
        'updated_at' => now(),
    ]);
}

function ensureOidcUnitTables(): void
{
    ensureUsersTable();
    ensureLoginContextsTable();
    ensureRefreshTokensTable();
    ensureAuthorizationCodesTable();
}

function ensureAuthorizationCodesTable(): void
{
    if (Schema::hasTable('authorization_codes')) {
        return;
    }

    Schema::create('authorization_codes', function (Blueprint $table): void {
        $table->string('code_hash', 64)->primary();
        $table->json('payload');
        $table->timestamp('expires_at');
        $table->timestamp('consumed_at')->nullable();
        $table->timestamp('created_at')->useCurrent();
    });
}

function ensureUsersTable(): void
{
    if (Schema::hasTable('users')) {
        return;
    }

    Schema::create('users', function (Blueprint $table): void {
        $table->id();
        $table->string('subject_id')->unique();
        $table->string('subject_uuid')->unique();
        $table->string('email')->unique();
        $table->string('given_name')->nullable();
        $table->string('family_name')->nullable();
        $table->string('display_name');
        $table->string('role')->default('user');
        $table->timestamp('email_verified_at')->nullable();
        $table->timestamp('last_login_at')->nullable();
        $table->timestamps();
    });
}

function ensureLoginContextsTable(): void
{
    if (Schema::hasTable('login_contexts')) {
        return;
    }

    Schema::create('login_contexts', function (Blueprint $table): void {
        $table->id();
        $table->string('subject_id')->unique();
        $table->string('subject_uuid')->unique();
        $table->string('ip_address')->nullable();
        $table->string('device_fingerprint')->nullable();
        $table->unsignedInteger('risk_score')->default(0);
        $table->boolean('mfa_required')->default(false);
        $table->timestamp('auth_time')->nullable();
        $table->json('amr')->nullable();
        $table->string('acr')->nullable();
        $table->timestamp('last_seen_at')->nullable();
        $table->timestamps();
    });
}

function ensureRefreshTokensTable(): void
{
    if (Schema::hasTable('refresh_token_rotations')) {
        return;
    }

    Schema::create('refresh_token_rotations', function (Blueprint $table): void {
        $table->id();
        $table->string('subject_id');
        $table->string('subject_uuid');
        $table->string('client_id');
        $table->string('refresh_token_id')->unique();
        $table->string('token_family_id');
        $table->timestamp('family_created_at')->nullable();
        $table->string('secret_hash');
        $table->string('scope');
        $table->string('session_id');
        $table->timestamp('auth_time')->nullable();
        $table->json('amr')->nullable();
        $table->string('acr')->nullable();
        $table->text('upstream_refresh_token')->nullable();
        $table->timestamp('expires_at');
        $table->string('replaced_by_token_id')->nullable();
        $table->timestamp('revoked_at')->nullable();
        $table->timestamps();
    });
}

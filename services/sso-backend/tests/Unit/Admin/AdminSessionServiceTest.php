<?php

declare(strict_types=1);

require_once __DIR__.'/../../Support/UnitOidcDatabase.php';

use App\Services\Admin\AdminSessionService;
use App\Services\Oidc\BackChannelSessionRegistry;
use Illuminate\Support\Facades\DB;

use function Tests\Support\ensureOidcUnitTables;
use function Tests\Support\resetOidcUnitTables;
use function Tests\Support\seedOidcUnitUser;

beforeEach(function (): void {
    config()->set('cache.default', 'array');
    ensureOidcUnitTables();
    resetOidcUnitTables();
    seedOidcUnitUser('user-1');
});

it('deduplicates logical sessions by session and client', function (): void {
    $latestCreatedAt = now()->subMinute()->toDateTimeString();

    seedRefreshToken([
        'session_id' => 'session-1',
        'client_id' => 'client-a',
        'refresh_token_id' => 'old-token',
        'created_at' => now()->subMinutes(5),
    ]);

    seedRefreshToken([
        'session_id' => 'session-1',
        'client_id' => 'client-a',
        'refresh_token_id' => 'new-token',
        'created_at' => $latestCreatedAt,
    ]);

    seedRefreshToken([
        'session_id' => 'session-2',
        'client_id' => 'client-b',
        'refresh_token_id' => 'other-token',
        'created_at' => now()->subMinutes(2),
    ]);

    $sessions = app(AdminSessionService::class)->activeSessions();

    expect($sessions)->toHaveCount(2)
        ->and($sessions[0]['session_id'])->toBe('session-1')
        ->and($sessions[0]['subject_id'])->toBe('user-1')
        ->and((string) $sessions[0]['created_at'])->toContain(''.$latestCreatedAt)
        ->and($sessions[1]['session_id'])->toBe('session-2');
});

it('includes back-channel-only client participants for visible logical sessions', function (): void {
    seedRefreshToken([
        'session_id' => 'shared-session',
        'client_id' => 'prototype-app-a',
        'refresh_token_id' => 'app-a-token',
    ]);

    app(BackChannelSessionRegistry::class)->register(
        'shared-session',
        'prototype-app-b',
        'https://app-b.example/auth/backchannel/logout',
        [
            'subject_id' => 'user-1',
            'scope' => 'openid profile email',
            'created_at' => now()->toDateTimeString(),
            'expires_at' => now()->addMinutes(15)->toDateTimeString(),
        ],
    );

    $clients = collect(app(AdminSessionService::class)->activeSessions())
        ->pluck('client_id')
        ->all();

    expect($clients)->toContain('prototype-app-a')
        ->and($clients)->toContain('prototype-app-b');
});

it('excludes stale or mismatched back-channel participants', function (): void {
    seedRefreshToken(['session_id' => 'shared-session', 'client_id' => 'prototype-app-a']);

    $registry = app(BackChannelSessionRegistry::class);
    $registry->register('shared-session', 'expired-app', 'https://expired.example/logout', [
        'subject_id' => 'user-1',
        'expires_at' => now()->subMinute()->toDateTimeString(),
    ]);
    $registry->register('shared-session', 'other-user-app', 'https://other.example/logout', [
        'subject_id' => 'user-2',
        'expires_at' => now()->addMinute()->toDateTimeString(),
    ]);

    $clients = collect(app(AdminSessionService::class)->activeSessions())->pluck('client_id');

    expect($clients)->not->toContain('expired-app')
        ->and($clients)->not->toContain('other-user-app')
        ->and($clients)->toContain('prototype-app-a');
});

function seedRefreshToken(array $overrides): void
{
    DB::table('refresh_token_rotations')->insert(array_merge([
        'subject_id' => 'user-1',
        'subject_uuid' => 'user-1',
        'client_id' => 'client-a',
        'refresh_token_id' => 'token-'.uniqid(),
        'token_family_id' => 'family-1',
        'secret_hash' => 'hash',
        'scope' => 'openid profile email',
        'session_id' => 'session-1',
        'upstream_refresh_token' => null,
        'expires_at' => now()->addDays(30),
        'replaced_by_token_id' => null,
        'revoked_at' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ], $overrides));
}

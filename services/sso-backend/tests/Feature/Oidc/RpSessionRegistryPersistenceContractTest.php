<?php

declare(strict_types=1);

use App\Services\Oidc\BackChannelSessionRegistry;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * BE-FR040-001 — RP Session Registry Persistence Contract.
 *
 * Locks the dual-write/read-through behavior:
 *
 *   1. Registering an RP session writes to `oidc_rp_sessions` (source
 *      of truth) AND warms the cache. Cache eviction MUST NOT lose
 *      the RP target — `forSession()` rebuilds from DB.
 *   2. Public clients without refresh tokens (no row in
 *      `refresh_token_rotations`) still surface in
 *      `sessionIdsForSubject()` once the cache is cold.
 *   3. `clear()` flips `revoked_at` on the row instead of deleting.
 *      Subsequent reads ignore revoked rows in both DB and cache.
 *   4. Re-registering the same `(sid, client_id)` upserts (one row)
 *      and refreshes `last_seen_at` — does not duplicate.
 */
beforeEach(function (): void {
    config()->set('sso.ttl.refresh_token_days', 14);
});

it('persists RP sessions to oidc_rp_sessions as the source of truth and survives cache eviction', function (): void {
    $registry = app(BackChannelSessionRegistry::class);
    $sessionId = 'sid-fr040-'.bin2hex(random_bytes(4));

    $registry->register(
        $sessionId,
        'app-a',
        'https://app-a.example/api/backchannel/logout',
        [
            'subject_id' => 'sub-1',
            'frontchannel_logout_uri' => 'https://app-a.example/logout/frontchannel',
            'channels' => ['backchannel', 'frontchannel'],
            'scope' => 'openid profile',
        ],
    );

    expect(DB::table('oidc_rp_sessions')
        ->where('sid', $sessionId)
        ->where('client_id', 'app-a')
        ->whereNull('revoked_at')
        ->count())->toBe(1);

    Cache::flush();

    $rebuilt = $registry->forSession($sessionId);

    expect($rebuilt)->toHaveCount(1)
        ->and($rebuilt[0]['client_id'])->toBe('app-a')
        ->and($rebuilt[0]['backchannel_logout_uri'])->toBe('https://app-a.example/api/backchannel/logout')
        ->and($rebuilt[0]['frontchannel_logout_uri'])->toBe('https://app-a.example/logout/frontchannel')
        ->and($rebuilt[0]['channels'])->toContain('backchannel')
        ->and($rebuilt[0]['scope'])->toBe('openid profile');
});

it('keeps public clients addressable from sessionIdsForSubject after a cache flush', function (): void {
    $registry = app(BackChannelSessionRegistry::class);
    $sessionId = 'sid-public-'.bin2hex(random_bytes(4));

    $registry->register(
        $sessionId,
        'app-public-pkce',
        'https://pkce.example/api/backchannel/logout',
        ['subject_id' => 'sub-public', 'channels' => ['backchannel']],
    );

    Cache::flush();

    expect($registry->sessionIdsForSubject('sub-public'))->toContain($sessionId);
});

it('soft-revokes RP sessions on clear and excludes them from subsequent reads', function (): void {
    $registry = app(BackChannelSessionRegistry::class);
    $sessionId = 'sid-clear-'.bin2hex(random_bytes(4));

    $registry->register($sessionId, 'app-a', 'https://app-a.example/api/backchannel/logout', [
        'subject_id' => 'sub-2',
    ]);
    $registry->clear($sessionId);

    expect($registry->forSession($sessionId))->toBe([])
        ->and($registry->sessionIdsForSubject('sub-2'))->not->toContain($sessionId)
        ->and(DB::table('oidc_rp_sessions')->where('sid', $sessionId)->whereNotNull('revoked_at')->count())->toBe(1);
});

it('upserts the same sid+client_id pair instead of creating duplicates', function (): void {
    $registry = app(BackChannelSessionRegistry::class);
    $sessionId = 'sid-upsert-'.bin2hex(random_bytes(4));

    $registry->register($sessionId, 'app-a', 'https://app-a.example/api/backchannel/logout', [
        'subject_id' => 'sub-3',
        'scope' => 'openid',
    ]);
    $registry->register($sessionId, 'app-a', 'https://app-a.example/api/backchannel/logout', [
        'subject_id' => 'sub-3',
        'scope' => 'openid profile email',
    ]);

    expect(DB::table('oidc_rp_sessions')
        ->where('sid', $sessionId)
        ->where('client_id', 'app-a')
        ->count())->toBe(1);

    $row = $registry->forSession($sessionId)[0];
    expect($row['scope'])->toBe('openid profile email');
});

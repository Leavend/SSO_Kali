<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Repositories\SsoSessionRepository;
use App\Services\Session\SsoSessionService;
use Illuminate\Support\Facades\DB;

/**
 * last_seen_at is a passive heartbeat. On a trusted browser mutation the activity
 * path (recordActivityBySessionId) already writes last_seen_at + activity_seen_at;
 * the subsequent session-resolution touchLastSeen must not issue a second,
 * redundant UPDATE to the same row in the same request.
 */
function throttleSession(): SsoSession
{
    $user = User::factory()->create();

    return app(SsoSessionService::class)
        ->createForUser($user, '127.0.0.1', 'pest-agent')
        ->refresh();
}

function ssoSessionUpdateCount(): int
{
    return count(array_filter(
        DB::getQueryLog(),
        static fn (array $entry): bool => str_contains(
            strtolower((string) $entry['query']),
            'update "sso_sessions"',
        ) || str_contains(
            strtolower((string) $entry['query']),
            'update `sso_sessions`',
        ),
    ));
}

describe('last_seen_at heartbeat throttle', function (): void {
    it('skips the redundant write when last_seen_at was updated within the throttle window', function (): void {
        $session = throttleSession();
        // A few seconds old: a non-throttled touch would dirty-write a new now();
        // the throttle must suppress it.
        $session->forceFill(['last_seen_at' => now()->subSeconds(5)])->save();
        $session->refresh();

        DB::enableQueryLog();
        app(SsoSessionRepository::class)->touchLastSeen($session);
        $count = ssoSessionUpdateCount();
        DB::disableQueryLog();

        expect($count)->toBe(0);
    });

    it('writes last_seen_at when it is stale beyond the throttle window', function (): void {
        $session = throttleSession();
        $session->forceFill(['last_seen_at' => now()->subMinutes(5)])->save();
        $session->refresh();

        DB::enableQueryLog();
        app(SsoSessionRepository::class)->touchLastSeen($session);
        $count = ssoSessionUpdateCount();
        DB::disableQueryLog();

        expect($count)->toBeGreaterThanOrEqual(1);
    });
});

<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Support\Session\SessionIdlePolicy;

beforeEach(function (): void {
    config()->set('sso.session.idle_minutes', 30);
});

function idleSession(array $attributes): SsoSession
{
    return (new SsoSession)->forceFill([
        'authenticated_at' => now()->subDay(),
        'last_seen_at' => now(),
        'activity_seen_at' => now(),
        ...$attributes,
    ]);
}

it('treats a session whose last activity is past the idle window as idle', function (): void {
    $session = idleSession(['activity_seen_at' => now()->subMinutes(31)]);

    expect(app(SessionIdlePolicy::class)->isIdle($session))->toBeTrue();
});

it('treats recent activity as not idle even when the passive last_seen_at heartbeat is old', function (): void {
    $session = idleSession([
        'activity_seen_at' => now()->subMinutes(5),
        'last_seen_at' => now()->subDay(),
    ]);

    expect(app(SessionIdlePolicy::class)->isIdle($session))->toBeFalse();
});

it('falls back to last_seen_at when activity_seen_at is null', function (): void {
    $session = idleSession([
        'activity_seen_at' => null,
        'last_seen_at' => now()->subMinutes(31),
    ]);

    expect(app(SessionIdlePolicy::class)->isIdle($session))->toBeTrue();
});

it('falls back to authenticated_at when activity and last_seen are null', function (): void {
    $session = idleSession([
        'activity_seen_at' => null,
        'last_seen_at' => null,
        'authenticated_at' => now()->subMinutes(31),
    ]);

    expect(app(SessionIdlePolicy::class)->isIdle($session))->toBeTrue();
});

it('never idles when idle_minutes is disabled', function (): void {
    config()->set('sso.session.idle_minutes', 0);
    $session = idleSession(['activity_seen_at' => now()->subYear()]);

    expect(app(SessionIdlePolicy::class)->isIdle($session))->toBeFalse();
});

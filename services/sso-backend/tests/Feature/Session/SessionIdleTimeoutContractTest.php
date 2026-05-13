<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Session\SsoSessionService;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * FR-039 / UC-49: Session idle timeout enforcement.
 *
 * Contract:
 *   - Sessions inactive beyond idle_minutes are revoked on next access
 *   - Sessions within idle window are kept alive (last_seen_at updated)
 *   - Absolute TTL still applies independently
 */
it('revokes session when idle timeout exceeded', function (): void {
    config(['sso.session.idle_minutes' => 30]);

    $user = createIdleTestUser('idle-expired');
    $session = createTestSession($user, lastSeenMinutesAgo: 31);

    $service = app(SsoSessionService::class);
    $result = $service->current($session->session_id);

    expect($result)->toBeNull();

    // Verify session was revoked in DB
    $session->refresh();
    expect($session->revoked_at)->not->toBeNull();
});

it('keeps session alive when within idle window', function (): void {
    config(['sso.session.idle_minutes' => 30]);

    $user = createIdleTestUser('idle-active');
    $session = createTestSession($user, lastSeenMinutesAgo: 10);

    $service = app(SsoSessionService::class);
    $result = $service->current($session->session_id);

    expect($result)->not->toBeNull()
        ->and($result->session_id)->toBe($session->session_id);
});

it('revokes session when absolute TTL exceeded even if recently active', function (): void {
    config(['sso.session.idle_minutes' => 30]);

    $user = createIdleTestUser('ttl-expired');
    $session = createTestSession($user, lastSeenMinutesAgo: 1, expiredMinutesAgo: 5);

    $service = app(SsoSessionService::class);
    $result = $service->current($session->session_id);

    expect($result)->toBeNull();
});

it('disables idle timeout when configured to zero', function (): void {
    config(['sso.session.idle_minutes' => 0]);

    $user = createIdleTestUser('idle-disabled');
    $session = createTestSession($user, lastSeenMinutesAgo: 120);

    $service = app(SsoSessionService::class);
    $result = $service->current($session->session_id);

    expect($result)->not->toBeNull();
});

function createIdleTestUser(string $id): User
{
    return User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => $id.'@idle.example.test',
        'password' => Hash::make('x'),
        'display_name' => 'Idle Test',
        'given_name' => 'Idle',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);
}

function createTestSession(User $user, int $lastSeenMinutesAgo, int $expiredMinutesAgo = -60): SsoSession
{
    $sessionId = (string) Str::uuid();

    return SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now()->subHours(2),
        'last_seen_at' => now()->subMinutes($lastSeenMinutesAgo),
        'expires_at' => now()->subMinutes($expiredMinutesAgo), // negative = future
    ]);
}

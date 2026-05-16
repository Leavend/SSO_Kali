<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Session\SsoSessionService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config()->set('sso.session.idle_minutes', 30);
    config()->set('sso.session.ttl_minutes', 480);
});

it('does not extend an idle-expired session via a concurrent heartbeat (atomic compare-and-swap)', function (): void {
    [, $sessionId] = sessionLifecycleRow();

    DB::table('sso_sessions')
        ->where('session_id', $sessionId)
        ->update(['last_seen_at' => now()->subMinutes(60)]);

    $service = app(SsoSessionService::class);
    $resolved = $service->current($sessionId);

    expect($resolved)->toBeNull();

    $row = DB::table('sso_sessions')->where('session_id', $sessionId)->first();
    expect($row->revoked_at)->not->toBeNull();
});

it('keeps an active session alive and bumps last_seen_at exactly once even when read concurrently', function (): void {
    [, $sessionId] = sessionLifecycleRow();
    $service = app(SsoSessionService::class);

    $first = $service->current($sessionId);
    $second = $service->current($sessionId);

    expect($first)->not->toBeNull()
        ->and($second)->not->toBeNull()
        ->and($first->session_id)->toBe($sessionId)
        ->and($second->session_id)->toBe($sessionId);
});

/**
 * @return array{0: User, 1: string}
 */
function sessionLifecycleRow(): array
{
    $user = User::factory()->create([
        'email' => 'lifecycle-'.Str::random(8).'@example.test',
    ]);

    $sessionId = (string) Str::uuid();
    SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'SessionLifecycleAtomicContract/1.0',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHour(),
    ]);

    return [$user, $sessionId];
}

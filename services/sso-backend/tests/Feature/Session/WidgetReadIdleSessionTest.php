<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use App\Services\Session\SsoSessionService;

/**
 * Idle-but-absolutely-valid session: last deliberate activity 60 min ago while
 * the absolute TTL (8h) is still in the future.
 */
function widgetIdleSession(): SsoSession
{
    config()->set('sso.session.idle_minutes', 30);
    $user = User::factory()->create();
    $session = app(SsoSessionService::class)->createForUser($user, '127.0.0.1', 'pest-agent');

    $session->forceFill([
        'activity_seen_at' => now()->subMinutes(60),
        'last_seen_at' => now()->subMinutes(60),
    ])->save();

    return $session->refresh();
}

describe('Passive widget read vs active idle enforcement', function (): void {
    it('peekActive returns an idle-but-valid session without revoking it', function (): void {
        $session = widgetIdleSession();

        $peeked = app(SsoSessionService::class)->peekActive($session->session_id);

        expect($peeked)->not->toBeNull()
            ->and($peeked->session_id)->toBe($session->session_id);

        $session->refresh();
        expect($session->revoked_at)->toBeNull();
    });

    it('peekActiveUser resolves the owning user without revoking the idle session', function (): void {
        $session = widgetIdleSession();

        $user = app(SsoSessionService::class)->peekActiveUser($session->session_id);

        expect($user)->not->toBeNull()
            ->and((int) $user->getKey())->toBe((int) $session->user_id);

        $session->refresh();
        expect($session->revoked_at)->toBeNull();
    });

    it('current() still revokes an idle session at active SSO use', function (): void {
        $session = widgetIdleSession();

        expect(app(SsoSessionService::class)->current($session->session_id))->toBeNull();

        $session->refresh();
        expect($session->revoked_at)->not->toBeNull();
    });

    it('peekActive returns null for a revoked session (no resurrection of a killed session)', function (): void {
        $user = User::factory()->create();
        $service = app(SsoSessionService::class);
        $session = $service->createForUser($user, '127.0.0.1', 'pest-agent');
        $service->revoke($session);

        expect($service->peekActive($session->session_id))->toBeNull()
            ->and($service->peekActiveUser($session->session_id))->toBeNull();
    });

    it('peekActive returns null for a session past its absolute TTL', function (): void {
        config()->set('sso.session.idle_minutes', 30);
        $user = User::factory()->create();
        $session = app(SsoSessionService::class)->createForUser($user, '127.0.0.1', 'pest-agent');
        $session->forceFill(['expires_at' => now()->subMinute()])->save();

        expect(app(SsoSessionService::class)->peekActive($session->session_id))->toBeNull();
    });
});

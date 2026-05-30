<?php

declare(strict_types=1);

use App\Models\User;
use App\Notifications\SuspiciousLoginNotification;
use App\Services\Oidc\DownstreamClientRegistry;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;

/**
 * FR-019 / UC-72: Suspicious login notification dispatch contract.
 *
 * Verifies that the LoginRiskEvaluator is wired into the local login
 * pipeline and dispatches SuspiciousLoginNotification when the risk
 * score exceeds the medium threshold.
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'local-test-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://local-app.test/callback'],
            'post_logout_redirect_uris' => ['https://local-app.test/'],
            'allowed_scopes' => ['openid', 'profile', 'email', 'offline_access'],
            'skip_consent' => true,
        ],
    ]);
    config()->set('sso.auth.max_login_attempts', 3);
    config()->set('sso.auth.login_lockout_seconds', 900);

    app(DownstreamClientRegistry::class)->flush();

    $this->user = User::factory()->create([
        'subject_id' => 'local-user-notif',
        'subject_uuid' => 'local-user-notif',
        'email' => 'notif-test@example.com',
        'password' => Hash::make('SecurePass123!'),
        'password_changed_at' => now(),
        'role' => 'user',
    ]);
});

function suspiciousLoginPayload(): array
{
    return [
        'email' => 'notif-test@example.com',
        'password' => 'SecurePass123!',
        'client_id' => 'local-test-app',
        'redirect_uri' => 'https://local-app.test/callback',
        'code_challenge' => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'code_challenge_method' => 'S256',
        'state' => 'state-notif-1',
        'nonce' => 'nonce-notif-1',
        'scope' => 'openid',
    ];
}

describe('POST /connect/local-login suspicious notification', function (): void {
    it('dispatches SuspiciousLoginNotification on login from new IP/device', function (): void {
        Notification::fake();

        $response = $this->postJson('/connect/local-login', suspiciousLoginPayload());

        $response->assertOk();

        Notification::assertSentTo(
            $this->user,
            SuspiciousLoginNotification::class,
        );
    });

    it('respects the throttle and does not re-notify within the same window', function (): void {
        Notification::fake();

        // First login — should dispatch
        $this->postJson('/connect/local-login', suspiciousLoginPayload())->assertOk();

        // Second login — should be rate-limited (same window, same user)
        $this->postJson('/connect/local-login', suspiciousLoginPayload())->assertOk();

        Notification::assertSentTo(
            $this->user,
            SuspiciousLoginNotification::class,
            1, // exactly once
        );
    });

    it('honors the security-notifications feature flag', function (): void {
        Notification::fake();
        config()->set('security-notifications.enabled', false);

        $this->postJson('/connect/local-login', suspiciousLoginPayload())->assertOk();

        Notification::assertNothingSent();
    });
});

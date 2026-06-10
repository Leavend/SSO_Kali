<?php

declare(strict_types=1);

use App\Models\User;
use App\Notifications\SuspiciousLoginNotification;
use App\Services\Oidc\DownstreamClientRegistry;
use App\Services\Security\LoginContextRecorder;
use Illuminate\Contracts\Notifications\Dispatcher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
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
    it('keeps the suspicious login notification queued', function (): void {
        expect(new SuspiciousLoginNotification(
            ipAddress: '203.0.113.10',
            userAgent: 'Mozilla/5.0',
            occurredAt: time(),
        ))->toBeInstanceOf(ShouldQueue::class);
    });

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

    it('persists login context and last login when notification dispatch fails', function (): void {
        Log::spy();

        $this->app->instance(Dispatcher::class, new class implements Dispatcher
        {
            public function send($notifiables, $notification): void
            {
                throw new RuntimeException('SMTP transport unavailable');
            }

            public function sendNow($notifiables, $notification, ?array $channels = null): void
            {
                throw new RuntimeException('SMTP transport unavailable');
            }
        });

        try {
            app(LoginContextRecorder::class)->record(
                $this->user,
                '203.0.113.10',
                'Mozilla/5.0 (Contract Test)',
                ['pwd'],
            );
        } catch (Throwable $exception) {
            $this->fail('Notification failure must not abort login context persistence: '.$exception->getMessage());
        }

        expect($this->user->refresh()->last_login_at)->not->toBeNull()
            ->and(DB::table('login_contexts')->where('subject_id', $this->user->subject_id)->exists())->toBeTrue();

        Log::shouldHaveReceived('error')->withArgs(
            fn (string $message, array $context): bool => $message === '[SUSPICIOUS_LOGIN_NOTIFICATION_FAILED]'
                && ($context['subject_id'] ?? null) === $this->user->subject_id,
        );
    });
});

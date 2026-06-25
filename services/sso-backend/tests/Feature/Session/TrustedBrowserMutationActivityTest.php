<?php

declare(strict_types=1);

use App\Http\Middleware\EnsureTrustedBrowserMutation;
use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * A trusted browser mutation (profile save, password change, MFA verify,
 * connected-app revoke) is deliberate user activity. The CSRF-backstop
 * middleware must record it through the non-revoking activity path so a session
 * that is merely past its idle window — but still within its absolute TTL — is
 * refreshed rather than killed. Regression guard for the markActivity() →
 * idle-revoke footgun.
 */
beforeEach(function (): void {
    config()->set('sso.session.cookie', '__Host-sso_session');
    config()->set('sso.session.idle_minutes', 30);
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
});

function idleButValidSession(User $user): SsoSession
{
    return SsoSession::query()->create([
        'session_id' => (string) Str::uuid(),
        'user_id' => $user->getKey(),
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now()->subMinutes(45),
        'last_seen_at' => now()->subMinutes(45),
        // Stale activity (idle window is 30m) but still absolutely valid.
        'activity_seen_at' => now()->subMinutes(45),
        'expires_at' => now()->addHours(4),
    ]);
}

function trustedMutationRequest(string $sessionId, string $origin = 'https://sso.timeh.my.id'): Request
{
    $request = Request::create('/api/profile', 'PATCH');
    $request->headers->set('Origin', $origin);
    $request->headers->set('X-Requested-With', 'XMLHttpRequest');
    $request->headers->set('Cookie', '__Host-sso_session='.$sessionId);

    return $request;
}

it('refreshes an idle-but-valid session on a trusted browser mutation instead of revoking it', function (): void {
    $user = User::factory()->create(['subject_id' => 'trusted-mutation-user']);
    $session = idleButValidSession($user);

    $reached = false;
    $response = app(EnsureTrustedBrowserMutation::class)->handle(
        trustedMutationRequest($session->session_id),
        function () use (&$reached) {
            $reached = true;

            return response('ok');
        },
    );

    expect($reached)->toBeTrue()
        ->and($response->getStatusCode())->toBe(200);

    $session->refresh();
    expect($session->revoked_at)->toBeNull()
        ->and($session->activity_seen_at->greaterThan(now()->subMinute()))->toBeTrue();
});

it('never revokes the session from the activity-recording step', function (): void {
    $user = User::factory()->create(['subject_id' => 'trusted-mutation-no-revoke']);
    $session = idleButValidSession($user);

    app(EnsureTrustedBrowserMutation::class)->handle(
        trustedMutationRequest($session->session_id),
        fn () => response('ok'),
    );

    expect(
        SsoSession::query()
            ->where('session_id', $session->session_id)
            ->whereNotNull('revoked_at')
            ->exists()
    )->toBeFalse();
});

it('still rejects a mutation presented from an untrusted origin', function (): void {
    $user = User::factory()->create(['subject_id' => 'trusted-mutation-untrusted']);
    $session = idleButValidSession($user);

    $response = app(EnsureTrustedBrowserMutation::class)->handle(
        trustedMutationRequest($session->session_id, 'https://evil.example'),
        fn () => response('ok'),
    );

    expect($response->getStatusCode())->toBe(403);

    $session->refresh();
    expect($session->activity_seen_at->lessThan(now()->subMinutes(30)))->toBeTrue();
});

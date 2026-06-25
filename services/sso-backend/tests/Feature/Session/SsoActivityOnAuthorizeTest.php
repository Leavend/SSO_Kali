<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * A browser-session /authorize (silent SSO reuse) must count as activity so an
 * actively-SSO-ing user does not idle-expire between explicit auth/mfa/profile
 * mutations.
 */
beforeEach(function (): void {
    config()->set('app.env', 'production');
    config()->set('sso.issuer', 'https://api-sso.timeh.my.id');
    config()->set('sso.base_url', 'https://api-sso.timeh.my.id');
    config()->set('sso.frontend_url', 'https://sso.timeh.my.id');
    config()->set('sso.session.idle_minutes', 30);
    config()->set('oidc_clients.clients', [
        'publik-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://publik.test/callback'],
            'post_logout_redirect_uris' => ['https://publik.test'],
            'allowed_scopes' => ['openid', 'profile', 'email'],
            'skip_consent' => true,
            'category' => 'publik',
        ],
    ]);
});

it('refreshes activity_seen_at when SSO is performed via an active browser session', function (): void {
    $user = User::factory()->create(['subject_id' => 'sso-activity-user']);

    $sessionId = (string) Str::uuid();
    $session = SsoSession::query()->create([
        'session_id' => $sessionId,
        'user_id' => $user->id,
        'subject_id' => $user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'SsoActivityContract/1.0',
        'authenticated_at' => now()->subMinutes(40),
        'last_seen_at' => now()->subMinutes(40),
        // Stale activity (idle window is 30m) but still absolutely valid.
        'activity_seen_at' => now()->subMinutes(40),
        'expires_at' => now()->addHours(4),
    ]);

    $verifier = rtrim(strtr(base64_encode(random_bytes(64)), '+/', '-_'), '=');
    $challenge = rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');

    $response = $this->withSession([
        'sso_browser_session' => [
            'subject_id' => $user->subject_id,
            'session_id' => $sessionId,
            'auth_time' => time(),
            'amr' => ['pwd'],
        ],
    ])->get('/authorize?'.http_build_query([
        'client_id' => 'publik-app',
        'redirect_uri' => 'https://publik.test/callback',
        'response_type' => 'code',
        'scope' => 'openid profile',
        'state' => 'state-'.Str::random(16),
        'nonce' => 'nonce-'.Str::random(16),
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
    ]));

    $response->assertRedirect();
    parse_str((string) parse_url((string) $response->headers->get('Location'), PHP_URL_QUERY), $query);

    expect($query['code'] ?? null)->toBeString()->not->toBe('');

    $session->refresh();
    expect($session->activity_seen_at->greaterThan(now()->subMinute()))->toBeTrue()
        ->and($session->revoked_at)->toBeNull();
});

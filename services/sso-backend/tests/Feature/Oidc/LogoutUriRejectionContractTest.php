<?php

declare(strict_types=1);

use App\Models\SsoSession;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * FR-010 / UC-47: Logout URI rejection contract test.
 *
 * Ensures /connect/logout rejects invalid post_logout_redirect_uri
 * without redirecting to attacker-controlled URIs.
 */
beforeEach(function (): void {
    config()->set('oidc_clients.clients', [
        'logout-test-app' => [
            'type' => 'public',
            'redirect_uris' => ['https://app.logout-test.example/callback'],
            'post_logout_redirect_uris' => ['https://app.logout-test.example/signed-out'],
            'backchannel_logout_uri' => null,
        ],
    ]);

    $this->user = User::query()->create([
        'subject_id' => (string) Str::uuid(),
        'subject_uuid' => (string) Str::uuid(),
        'email' => 'logout-fr010@test.example',
        'password' => Hash::make('x'),
        'display_name' => 'FR-010 Logout',
        'given_name' => 'Logout',
        'role' => 'user',
        'status' => 'active',
        'local_account_enabled' => true,
    ]);

    $this->sessionId = (string) Str::ulid();
    SsoSession::query()->create([
        'session_id' => $this->sessionId,
        'user_id' => $this->user->getKey(),
        'subject_id' => $this->user->subject_id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'phpunit',
        'authenticated_at' => now(),
        'last_seen_at' => now(),
        'expires_at' => now()->addHours(8),
    ]);
});

it('rejects unregistered post_logout_redirect_uri', function (): void {
    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'logout-test-app',
            'post_logout_redirect_uri' => 'https://evil.example/steal',
        ]));

    $response->assertStatus(400);
    $response->assertHeaderMissing('Location');
});

it('rejects post_logout_redirect_uri with HTTP downgrade', function (): void {
    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'logout-test-app',
            'post_logout_redirect_uri' => 'http://app.logout-test.example/signed-out',
        ]));

    $response->assertStatus(400);
    $response->assertHeaderMissing('Location');
});

it('rejects post_logout_redirect_uri with fragment', function (): void {
    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'logout-test-app',
            'post_logout_redirect_uri' => 'https://app.logout-test.example/signed-out#fragment',
        ]));

    $response->assertStatus(400);
    $response->assertHeaderMissing('Location');
});

it('rejects post_logout_redirect_uri with trailing slash mismatch', function (): void {
    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'logout-test-app',
            'post_logout_redirect_uri' => 'https://app.logout-test.example/signed-out/',
        ]));

    $response->assertStatus(400);
    $response->assertHeaderMissing('Location');
});

it('redirects to valid post_logout_redirect_uri with state', function (): void {
    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'logout-test-app',
            'post_logout_redirect_uri' => 'https://app.logout-test.example/signed-out',
            'state' => 'logout-state-xyz',
        ]));

    $response->assertRedirect();
    $location = $response->headers->get('Location');
    expect($location)->toContain('https://app.logout-test.example/signed-out')
        ->and($location)->toContain('state=logout-state-xyz');
});

it('handles logout without post_logout_redirect_uri gracefully', function (): void {
    $response = $this->withHeader('Cookie', config('sso.session.cookie').'='.$this->sessionId)
        ->get('/connect/logout?'.http_build_query([
            'client_id' => 'logout-test-app',
        ]));

    // Should not error — either redirect to default or show confirmation
    expect($response->status())->toBeIn([200, 302, 303]);
});

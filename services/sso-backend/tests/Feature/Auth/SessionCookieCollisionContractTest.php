<?php

declare(strict_types=1);

/**
 * SessionCookieCollision Contract Test.
 *
 * Memastikan Laravel framework session cookie dan SSO custom session cookie
 * menggunakan nama yang BERBEDA sehingga tidak terjadi collision.
 *
 * Root cause: Jika keduanya menggunakan nama yang sama (__Host-sso_session),
 * Laravel framework session (random string) menimpa SSO session (UUID),
 * menyebabkan SsoSessionCookieResolver gagal validasi → 401 Unauthorized.
 *
 * @see https://github.com/Leavend/SSO_Kali/issues/401-session-collision
 */

use App\Models\SsoSession;
use App\Models\User;

describe('Session Cookie Collision Prevention', function (): void {
    it('uses different cookie names for framework session and SSO session', function (): void {
        $frameworkCookieName = config('session.cookie');
        $ssoCookieName = config('sso.session.cookie');

        expect($frameworkCookieName)
            ->not->toBe($ssoCookieName, 'Framework session cookie MUST NOT collide with SSO session cookie');
    });

    it('framework session cookie does NOT use __Host-sso_session name', function (): void {
        $frameworkCookieName = config('session.cookie');

        expect($frameworkCookieName)
            ->not->toBe('__Host-sso_session', 'Framework session must not use the SSO session cookie name');
    });

    it('SSO session cookie retains __Host-sso_session name', function (): void {
        $ssoCookieName = config('sso.session.cookie');

        expect($ssoCookieName)->toBe('__Host-sso_session');
    });

    it('authenticated session resolves correctly without framework cookie interference', function (): void {
        $user = User::factory()->create([
            'email' => 'collision-test@example.test',
            'password' => 'correct-password',
        ]);

        // Login to establish SSO session
        $loginResponse = $this->postJson('/api/auth/login', [
            'identifier' => 'collision-test@example.test',
            'password' => 'correct-password',
        ]);

        $loginResponse->assertOk();
        $loginResponse->assertJsonPath('authenticated', true);

        // Get the SSO session UUID from database
        $sessionId = (string) SsoSession::query()
            ->where('subject_id', $user->subject_id)
            ->whereNull('revoked_at')
            ->value('session_id');

        expect($sessionId)->not->toBeEmpty();
        expect($sessionId)->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i');

        // Use SSO session cookie to call /api/auth/session
        $ssoCookieName = config('sso.session.cookie', '__Host-sso_session');

        $sessionResponse = $this->withHeader('Cookie', "{$ssoCookieName}={$sessionId}")
            ->getJson('/api/auth/session');

        // Must resolve successfully — NOT 401
        $sessionResponse->assertOk();
        $sessionResponse->assertJsonPath('authenticated', true);
        $sessionResponse->assertJsonPath('user.email', 'collision-test@example.test');
    });

    it('profile endpoints resolve correctly with SSO session cookie', function (): void {
        $user = User::factory()->create([
            'email' => 'profile-collision-test@example.test',
            'password' => 'correct-password',
        ]);

        // Login
        $this->postJson('/api/auth/login', [
            'identifier' => 'profile-collision-test@example.test',
            'password' => 'correct-password',
        ])->assertOk();

        // Get SSO session UUID
        $sessionId = (string) SsoSession::query()
            ->where('subject_id', $user->subject_id)
            ->whereNull('revoked_at')
            ->value('session_id');

        $ssoCookieName = config('sso.session.cookie', '__Host-sso_session');

        // Profile endpoint must also work
        $this->withHeader('Cookie', "{$ssoCookieName}={$sessionId}")
            ->getJson('/api/profile')
            ->assertOk();

        // Connected apps endpoint
        $this->withHeader('Cookie', "{$ssoCookieName}={$sessionId}")
            ->getJson('/api/profile/connected-apps')
            ->assertOk();

        // Sessions endpoint
        $this->withHeader('Cookie', "{$ssoCookieName}={$sessionId}")
            ->getJson('/api/profile/sessions')
            ->assertOk();
    });
});

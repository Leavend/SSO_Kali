<?php

declare(strict_types=1);

/**
 * SsoSessionCookieEncryption Contract Test.
 *
 * Memastikan cookie SSO session (`__Host-sso_session`) dikecualikan dari
 * enkripsi middleware sehingga SsoSessionCookieResolver dapat membaca
 * UUID session ID secara langsung tanpa dekripsi.
 *
 * Reproduces: 401 Unauthorized pada GET /api/auth/session setelah login
 * berhasil — cookie terenkripsi gagal lolos validasi UUID di resolver.
 *
 * Root cause: bootstrap/app.php encryptCookies exception menggunakan
 * fallback 'sso_session' sementara cookie factory membuat '__Host-sso_session'.
 */

use App\Models\User;
use App\Models\SsoSession;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Support\Facades\Hash;

it('registers the SSO session cookie in the EncryptCookies never-encrypt list', function (): void {
    $cookieName = config('sso.session.cookie', '__Host-sso_session');

    $ref = new ReflectionClass(EncryptCookies::class);
    $prop = $ref->getProperty('neverEncrypt');
    $prop->setAccessible(true);

    $neverEncrypt = $prop->getValue();

    expect($neverEncrypt)->toContain($cookieName);
});

it('creates a session cookie that resolves on subsequent requests', function (): void {
    $user = User::factory()->create([
        'email' => 'cookie-test@example.test',
        'password' => 'correct-password',
    ]);

    // Act: login to get the session cookie
    $loginResponse = $this->postJson('/api/auth/login', [
        'identifier' => 'cookie-test@example.test',
        'password' => 'correct-password',
    ]);

    $loginResponse->assertOk();
    $loginResponse->assertJsonPath('authenticated', true);

    // Get the session ID from the database (the authoritative source)
    $sessionId = (string) SsoSession::query()
        ->where('subject_id', $user->subject_id)
        ->whereNull('revoked_at')
        ->value('session_id');

    expect($sessionId)->not->toBeEmpty();
    expect($sessionId)->toMatch('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i');

    // Act: use the session cookie to call /api/auth/session
    $cookieName = config('sso.session.cookie', '__Host-sso_session');

    $sessionResponse = $this->withHeader('Cookie', "{$cookieName}={$sessionId}")
        ->getJson('/api/auth/session');

    // Assert: session resolves successfully (not 401)
    $sessionResponse->assertOk();
    $sessionResponse->assertJsonPath('authenticated', true);
    $sessionResponse->assertJsonPath('user.email', 'cookie-test@example.test');
});

it('returns 401 when no session cookie is present', function (): void {
    $this->getJson('/api/auth/session')
        ->assertUnauthorized()
        ->assertJsonPath('authenticated', false);
});

it('returns 401 when session cookie contains an invalid non-UUID value', function (): void {
    $cookieName = config('sso.session.cookie', '__Host-sso_session');

    $this->withHeader('Cookie', "{$cookieName}=not-a-valid-uuid")
        ->getJson('/api/auth/session')
        ->assertUnauthorized()
        ->assertJsonPath('authenticated', false);
});

it('maintains session across multiple requests with the same cookie', function (): void {
    $user = User::factory()->create([
        'email' => 'persist-test@example.test',
        'password' => 'correct-password',
    ]);

    // Login
    $this->postJson('/api/auth/login', [
        'identifier' => 'persist-test@example.test',
        'password' => 'correct-password',
    ])->assertOk();

    $cookieName = config('sso.session.cookie', '__Host-sso_session');
    $sessionId = (string) SsoSession::query()
        ->where('subject_id', $user->subject_id)
        ->whereNull('revoked_at')
        ->value('session_id');

    expect($sessionId)->not->toBeEmpty();

    // First session check
    $this->withHeader('Cookie', "{$cookieName}={$sessionId}")
        ->getJson('/api/auth/session')
        ->assertOk()
        ->assertJsonPath('authenticated', true);

    // Second session check (simulates subsequent navigation)
    $this->withHeader('Cookie', "{$cookieName}={$sessionId}")
        ->getJson('/api/auth/session')
        ->assertOk()
        ->assertJsonPath('authenticated', true);

    // Profile endpoints should also work
    $this->withHeader('Cookie', "{$cookieName}={$sessionId}")
        ->getJson('/api/profile')
        ->assertOk();
});

it('confirms the cookie name in config matches the encryption exception', function (): void {
    // The cookie name used by the factory must match the encryption exception
    $configuredName = config('sso.session.cookie');
    expect($configuredName)->toBe('__Host-sso_session');

    // The EncryptCookies middleware must exclude this exact name
    $ref = new ReflectionClass(EncryptCookies::class);
    $prop = $ref->getProperty('neverEncrypt');
    $prop->setAccessible(true);

    expect($prop->getValue())->toContain($configuredName);
});
